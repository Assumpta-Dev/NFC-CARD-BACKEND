// ===========================================================
// ROUTE DEFINITIONS
// ===========================================================
// Routes wire HTTP methods + paths to controllers + middleware.
// Each module exports a Router that gets mounted in index.ts.
//
// Route design follows REST conventions:
//   - Nouns for resources (cards, users, profile)
//   - HTTP verbs for actions (GET=read, POST=create, PUT=update)
//   - Consistent URL structure: /api/<resource>/<id>/<sub-resource>
//
// @swagger JSDoc comments are placed on each route so the docs
// stay co-located with the code — swagger.ts scans this file.
// ===========================================================

import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { CardController } from "../controllers/card.controller";
import {
  ProfileController,
  AdminController,
} from "../controllers/profile.controller";
import { UserController } from "../controllers/user.controller";
import { requireAuth, requireAdmin, requireBusiness } from "../middleware/auth.middleware";
import {
  validate,
  RegisterSchema,
  LoginSchema,
  UpdateProfileSchema,
  CreateCardSchema,
  AssignCardSchema,
} from "../middleware/validate.middleware";
import { uploadPhoto } from "../middleware/upload.middleware";
import { BusinessController } from "../controllers/business.controller";
import { MenuController } from "../controllers/menu.controller";
import { PaymentController } from "../controllers/payment.controller";

// ===========================================================
// AUTH ROUTES — /api/auth
// ===========================================================
export const authRouter = Router();
export const businessRouter = Router();


export const menuRouter = Router();
export const paymentRouter = Router();

/**
 * @swagger
 * /api/payments/initiate:
 *   post:
 *     tags: [Payments]
 *     summary: Initiate subscription payment
 *     description: |
 *       Starts a subscription payment based on selected plan and billing cycle.
 *
 *       IMPORTANT:
 *       - Pricing is NOT provided by the user.
 *       - The backend calculates the correct amount based on:
 *         (plan + billingCycle).
 *
 *       Payment Methods:
 *       - MTN
 *       - AIRTEL
 *
 *       Mode:
 *       - TEST → simulates payment (no real money)
 *       - LIVE → real payment (future integration)
 *
 *       Frontend Implementation Guide:
 *       - Plan → dropdown (FREE, PLUS, BUSINESS)
 *       - Billing Cycle → dropdown (MONTHLY, ANNUAL)
 *       - Payment Method → dropdown (MTN, AIRTEL)
 *       - Phone → required only for mobile money
 *
 *     security:
 *       - bearerAuth: []
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - plan
 *               - billingCycle
 *               - method
 *               - mode
 *             properties:
 *               plan:
 *                 type: string
 *                 enum: [BASIC, PREMIUM, ENTERPRISE]
 *                 example: "BASIC"
 *               billingCycle:
 *                 type: string
 *                 enum: [MONTHLY, ANNUAL]
 *                 example: "MONTHLY"
 *               amount:
 *                 type: number
 *                 example: 1000
 *               currency:
 *                 type: string
 *                 example: "RWF"

 *               method:
 *                 type: string
 *                 enum: [MTN, AIRTEL]
 *                 example: "MTN"
 *
 *               phone:
 *                 type: string
 *                 example: "0788123456"
 *                 description: |
 *                   Required for mobile money payments (MTN/AIRTEL).
 *                   Must be a valid Rwanda phone number.
 *
 *               mode:
 *                 type: string
 *                 enum: [TEST, LIVE]
 *                 example: "TEST"
 *                 description: |
 *                   TEST → simulate payment without real money.
 *                   LIVE → process real payment (used in production).
 *
 *     responses:
 *       201:
 *         description: Payment initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentId:
 *                       type: string
 *                       example: "clx123abc"
 *                     status:
 *                       type: string
 *                       example: "PENDING"
 *
 *       400:
 *         description: Invalid request (e.g. wrong plan, missing phone)
 *
 *       401:
 *         description: Unauthorized (user not logged in)
 */
paymentRouter.post("/initiate", requireAuth, PaymentController.initiatePayment);

// webhook (NO auth)
/**
 * @swagger
 * /api/payments/callback:
 *   post:
 *     tags: [Payments]
 *     summary: Payment provider callback webhook
 *     description: |
 *       Receives payment result from the payment provider.
 *
 *       IMPORTANT:
 *       - This endpoint is NOT called by frontend.
 *       - It is called by the payment provider (e.g. Flutterwave).
 *       - It updates payment status and activates subscription.
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reference
 *               - status
 *             properties:
 *               reference:
 *                 type: string
 *                 example: "sub_987654"
 *                 description: Internal payment reference
 *
 *               transactionId:
 *                 type: string
 *                 example: "txn_123456"
 *                 description: External provider transaction ID
 *
 *               status:
 *                 type: string
 *                 enum: [SUCCESS, FAILED, PENDING]
 *                 example: "SUCCESS"
 *                 description: Payment result status
 *
 *     responses:
 *       200:
 *         description: Callback processed successfully
 *
 *       400:
 *         description: Invalid payload
 */
// Webhook — no auth, Paypack calls this when payment status changes
// Register this URL on Paypack dashboard: https://<your-backend-domain>/api/payments/webhook
paymentRouter.post("/webhook", PaymentController.handleWebhook);

/**
 * @swagger
 * /api/menus:
 *   post:
 *     tags: [Menus]
 *     summary: Create a new menu
 *     description: |
 *       Creates a menu category such as Food, Drinks, or Desserts
 *       for the authenticated business owner.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Breakfast Menu"
 *     responses:
 *       201:
 *         description: Menu created successfully
 *       400:
 *         description: Business profile not found
 *       401:
 *         description: Unauthorized
 */
menuRouter.post("/", requireAuth, MenuController.createMenu);

/**
 * @swagger
 * /api/menus/{menuId}/items:
 *   post:
 *     tags: [Menus]
 *     summary: Add item to a menu
 *     description: Adds a food or drink item under a specific menu.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: menuId
 *         required: true
 *         schema:
 *           type: string
 *         description: Menu ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *             properties:
 *               name:
 *                 type: string
 *                 example: "African Tea"
 *               price:
 *                 type: number
 *                 example: 2500
 *               description:
 *                 type: string
 *                 example: "Spiced ginger and milk tea"
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Image of the menu item (JPEG, PNG, WebP)
 *     responses:
 *       201:
 *         description: Menu item added successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
menuRouter.post("/:menuId/items", requireAuth, requireBusiness, uploadPhoto, MenuController.addMenuItem);
/**
 * @swagger
 * /api/business:
 *   post:
 *     tags: [Business]
 *     summary: Create or update business profile
 *     description: |
 *       Creates a business profile or updates it if it already exists
 *       for the authenticated business user.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - category
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Mama Restaurant"
 *               category:
 *                 type: string
 *                 example: "restaurant"
 *               phone:
 *                 type: string
 *                 example: "0788123456"
 *               location:
 *                 type: string
 *                 example: "Kigali, Rwanda"
 *               description:
 *                 type: string
 *                 example: "Traditional African cuisine restaurant"
 *               email:
 *                 type: string
 *                 example: "info@mama.rw"
 *               website:
 *                 type: string
 *                 example: "https://mama.rw"
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Business logo/image (JPEG, PNG, WebP)
 *     responses:
 *       200:
 *         description: Business profile saved successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Business account required
 */
businessRouter.post("/", requireAuth, requireBusiness, uploadPhoto, BusinessController.upsertBusinessProfile);

/**
 * @swagger
 * /api/business:
 *   get:
 *     tags: [Business]
 *     summary: Get authenticated business owner's full profile
 *     description: Returns the business profile including all menus, menu items, and linked cards.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Business profile with menus and cards
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     category:
 *                       type: string
 *                     description:
 *                       type: string
 *                     menus:
 *                       type: array
 *                       items:
 *                         type: object
 *                     cards:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Business account required
 *       404:
 *         description: Business profile not found
 */
businessRouter.get("/", requireAuth, requireBusiness, BusinessController.getMyBusiness);

/**
 * @swagger
 * /api/business/card:
 *   get:
 *     tags: [Business]
 *     summary: Get cards linked to this business
 *     description: Returns all physical cards linked to the authenticated business profile.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of business cards
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       cardId:
 *                         type: string
 *                         example: "CARD_8F3K2L"
 *                       status:
 *                         type: string
 *                         example: "ACTIVE"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Business account required
 *       404:
 *         description: Business profile not found
 */
businessRouter.get("/card", requireAuth, requireBusiness, BusinessController.getMyBusinessCard);

/**
 * @swagger
 * /api/business/card:
 *   post:
 *     tags: [Business]
 *     summary: Link an existing card to this business
 *     description: |
 *       Links an unassigned or user card to this business profile.
 *       Once linked the card shows the business menu when scanned.
 *       Admin can also call this on behalf of any business.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cardId
 *             properties:
 *               cardId:
 *                 type: string
 *                 example: "CARD_8F3K2L"
 *                 description: The public card ID printed on the physical card
 *     responses:
 *       200:
 *         description: Card linked to business successfully
 *       400:
 *         description: cardId is required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Business account required
 *       404:
 *         description: Card or business not found
 *       409:
 *         description: Card already linked to another business
 */
businessRouter.post("/card", requireAuth, requireBusiness, BusinessController.linkCardToBusiness);

// ===========================================================
// MENU ROUTES — additional endpoints
// ===========================================================

/**
 * @swagger
 * /api/menus:
 *   get:
 *     tags: [Menus]
 *     summary: Get all menus for the authenticated business (paginated)
 *     description: Returns all menu categories for the signed-in business owner.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 10
 *     responses:
 *       200:
 *         description: Paginated list of menus with items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                         example: "Breakfast Menu"
 *                       items:
 *                         type: array
 *                         items:
 *                           type: object
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Business account required
 *       404:
 *         description: Business profile not found
 */
menuRouter.get("/", requireAuth, requireBusiness, MenuController.getMenus);

/**
 * @swagger
 * /api/menus/{menuId}/items/{itemId}:
 *   delete:
 *     tags: [Menus]
 *     summary: Delete a menu item
 *     description: Removes a specific item from a menu. Only the owning business can delete items.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: menuId
 *         required: true
 *         schema:
 *           type: string
 *         description: Menu ID
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Menu Item ID
 *     responses:
 *       200:
 *         description: Menu item deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Business account required or access denied
 *       404:
 *         description: Menu or item not found
 */
menuRouter.delete("/:menuId/items/:itemId", requireAuth, requireBusiness, MenuController.deleteMenuItem);

// ===========================================================
// PAYMENT ROUTES — GET endpoints
// ===========================================================

/**
 * @swagger
 * /api/payments/my:
 *   get:
 *     tags: [Payments]
 *     summary: Get payment history for the authenticated user (paginated)
 *     description: Returns all payments made by the currently signed-in user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 10
 *     responses:
 *       200:
 *         description: Paginated list of user payments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       plan:
 *                         type: string
 *                         example: "PLUS"
 *                       billingCycle:
 *                         type: string
 *                         example: "MONTHLY"
 *                       amount:
 *                         type: number
 *                         example: 5000
 *                       currency:
 *                         type: string
 *                         example: "RWF"
 *                       status:
 *                         type: string
 *                         example: "SUCCESS"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Unauthorized
 */
paymentRouter.get("/my", requireAuth, PaymentController.getMyPayments);

/**
 * @swagger
 * /api/payments/{id}:
 *   get:
 *     tags: [Payments]
 *     summary: Get a specific payment by ID
 *     description: Returns a single payment record. Only the owner or admin can view it.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Payment record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Payment not found
 */
paymentRouter.get("/:id/status", requireAuth, PaymentController.checkStatus);
paymentRouter.get("/:id", requireAuth, PaymentController.getPaymentById);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterBody'
 *     responses:
 *       201:
 *         description: User registered successfully, returns JWT token
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
authRouter.post("/register", validate(RegisterSchema), AuthController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginBody'
 *     responses:
 *       200:
 *         description: Login successful, returns JWT token
 *       401:
 *         description: Invalid email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
authRouter.post("/login", validate(LoginSchema), AuthController.login);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user info
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user data decoded from JWT
 *       401:
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
authRouter.get("/me", requireAuth, AuthController.me);

// Public routes — card view via auth router (mounted at /api/auth)
authRouter.get("/:cardId", CardController.getPublicCard);
authRouter.get("/:cardId/vcard", CardController.downloadVCard);

// ===========================================================
// CARD ROUTES — /api/cards
// ===========================================================
export const cardRouter = Router();

/**
 * @swagger
 * /api/cards/my:
 *   get:
 *     tags: [Cards]
 *     summary: Get all cards belonging to the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's cards with scan counts
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
cardRouter.get("/my", requireAuth, CardController.getMyCards);

/**
 * @swagger
 * /api/cards/{cardId}/analytics:
 *   get:
 *     tags: [Cards]
 *     summary: Get scan analytics for a specific card
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: cardId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: CARD_AB3K2L
 *     responses:
 *       200:
 *         description: Analytics including total scans, daily breakdown, device breakdown
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Card does not belong to this user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Card not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
cardRouter.get(
  "/:cardId/analytics",
  requireAuth,
  CardController.getCardAnalytics,
);

// ===========================================================
// PROFILE ROUTES — /api/profile
// ===========================================================
export const profileRouter = Router();

// All profile routes require authentication
profileRouter.use(requireAuth);

/**
 * @swagger
 * /api/profile/photo:
 *   post:
 *     tags: [Profile]
 *     summary: Upload a profile photo
 *     description: Accepts a multipart/form-data request with a 'photo' field. Uploads to Cloudinary and saves the URL.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [photo]
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: JPEG, PNG or WebP image (max 5MB)
 *     responses:
 *       200:
 *         description: Photo uploaded, returns Cloudinary URL
 *       400:
 *         description: No file provided or invalid file type
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
profileRouter.post("/photo", uploadPhoto, ProfileController.uploadPhoto);

/**
 * @swagger
 * /api/profile:
 *   get:
 *     tags: [Profile]
 *     summary: Get the authenticated user's full profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile data including all links
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Profile not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
profileRouter.get("/", ProfileController.getMyProfile);

/**
 * @swagger
 * /api/profile:
 *   put:
 *     tags: [Profile]
 *     summary: Update the authenticated user's profile and links
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProfileBody'
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
profileRouter.put(
  "/",
  validate(UpdateProfileSchema),
  ProfileController.updateMyProfile,
);

// ===========================================================
// ADMIN ROUTES — /api/admin
// ===========================================================
export const adminRouter = Router();
export const userRouter = Router();

// All admin routes require authentication AND admin role
adminRouter.use(requireAuth, requireAdmin);

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Get system-wide statistics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Total users, cards, scans, and active cards
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get("/stats", AdminController.getSystemStats);

/**
 * @swagger
 * /api/admin/cards:
 *   get:
 *     tags: [Admin]
 *     summary: List all cards in the system with owner and scan count
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All cards
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get("/cards", AdminController.getAllCards);

/**
 * @swagger
 * /api/admin/users/count:
 *   get:
 *     tags: [Admin]
 *     summary: Get total number of registered users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Total user count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       example: 123
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get("/users/count", AdminController.getUserCount);

/**
 * @swagger
 * /api/admin/users/top:
 *   get:
 *     tags: [Admin]
 *     summary: Get top users by scan count
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 5
 *     responses:
 *       200:
 *         description: Top users by scan count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: string
 *                         example: usr_123
 *                       scanCount:
 *                         type: integer
 *                         example: 45
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get("/users/top", AdminController.getTopUsers);

/**
 * @swagger
 * /api/admin/cards/count:
 *   get:
 *     tags: [Admin]
 *     summary: Get total number of cards
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Total card count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       example: 45
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get("/cards/count", AdminController.getCardCount);

/**
 * @swagger
 * /api/admin/cards/top:
 *   get:
 *     tags: [Admin]
 *     summary: Get top scanned cards
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 5
 *     responses:
 *       200:
 *         description: Top scanned cards
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       cardId:
 *                         type: string
 *                         example: CARD_DEMO1
 *                       scanCount:
 *                         type: integer
 *                         example: 23
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get("/cards/top", AdminController.getTopCards);

/**
 * @swagger
 * /api/admin/scans/count:
 *   get:
 *     tags: [Admin]
 *     summary: Get scan count for a date range
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: range
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           example: 30d
 *     responses:
 *       200:
 *         description: Scan count for range
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       example: 987
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get("/scans/count", AdminController.getScanCount);

/**
 * @swagger
 * /api/admin/scans/daily:
 *   get:
 *     tags: [Admin]
 *     summary: Get daily scan totals by date
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: range
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           example: 7d
 *     responses:
 *       200:
 *         description: Daily scan counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         example: 2026-04-14
 *                       count:
 *                         type: integer
 *                         example: 23
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get("/scans/daily", AdminController.getDailyScanBreakdown);

/**
 * @swagger
 * /api/admin/users/active:
 *   get:
 *     tags: [Admin]
 *     summary: Get count of active users in a date range
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: range
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           example: 30d
 *     responses:
 *       200:
 *         description: Active user count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       example: 15
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get("/users/active", AdminController.getActiveUsers);

/**
 * @swagger
 * /api/admin/cards/active:
 *   get:
 *     tags: [Admin]
 *     summary: Get count of active cards in a date range
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: range
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           example: 30d
 *     responses:
 *       200:
 *         description: Active card count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       example: 12
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get("/cards/active", AdminController.getActiveCards);

/**
 * @swagger
 * /api/admin/analytics/daily-scans:
 *   get:
 *     tags: [Admin]
 *     summary: Get daily scan totals by date
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: range
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           example: 7d
 *     responses:
 *       200:
 *         description: Daily scan counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         example: 2026-04-14
 *                       count:
 *                         type: integer
 *                         example: 23
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get(
  "/analytics/daily-scans",
  AdminController.getDailyScanBreakdown,
);

/**
 * @swagger
 * /api/admin/analytics/top-cards:
 *   get:
 *     tags: [Admin]
 *     summary: Get top scanned cards in a date range
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 5
 *       - name: range
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           example: 30d
 *     responses:
 *       200:
 *         description: Top cards by scan count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       cardId:
 *                         type: string
 *                         example: CARD_DEMO1
 *                       scans:
 *                         type: integer
 *                         example: 120
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get("/analytics/top-cards", AdminController.getTopCards);

/**
 * @swagger
 * /api/admin/analytics/top-users:
 *   get:
 *     tags: [Admin]
 *     summary: Get top scanned users in a date range
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 5
 *       - name: range
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           example: 30d
 *     responses:
 *       200:
 *         description: Top users by scan count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: string
 *                         example: usr_123
 *                       name:
 *                         type: string
 *                         example: Alice
 *                       scans:
 *                         type: integer
 *                         example: 45
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get("/analytics/top-users", AdminController.getTopUsers);

/**
 * @swagger
 * /api/admin/scans/export:
 *   get:
 *     tags: [Admin]
 *     summary: Export all scan events as CSV
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file of scan events
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get("/scans/export", AdminController.exportScansCsv);

/**
 * @swagger
 * /api/admin/cards/{cardId}/assign:
 *   put:
 *     tags: [Admin]
 *     summary: Assign a card to a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: cardId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: CARD_DEMO1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 example: usr_123
 *             required:
 *               - userId
 *     responses:
 *       200:
 *         description: Card assigned successfully
 *       400:
 *         description: Validation failed
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Card not found
 *       409:
 *         description: Card already assigned
 */
adminRouter.put(
  "/cards/:cardId/assign",
  validate(AssignCardSchema),
  AdminController.assignCardToUser,
);

/**
 * @swagger
 * /api/admin/cards:
 *   post:
 *     tags: [Admin]
 *     summary: Generate new unassigned physical cards
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCardBody'
 *     responses:
 *       201:
 *         description: Cards created successfully
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.post(
  "/cards",
  validate(CreateCardSchema),
  AdminController.createCards,
);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List registered users with pagination
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: size
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 25
 *     responses:
 *       200:
 *         description: Paginated users list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           role:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                           _count:
 *                             type: object
 *                             properties:
 *                               cards:
 *                                 type: integer
 *                     total:
 *                       type: integer
 *                       example: 50
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     size:
 *                       type: integer
 *                       example: 25
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * @swagger
 * /api/user/analytics/summary:
 *   get:
 *     tags: [User]
 *     summary: Get authenticated user's scan summary
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Scan summary counts for the authenticated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     today:
 *                       type: integer
 *                       example: 5
 *                     week:
 *                       type: integer
 *                       example: 20
 *                     total:
 *                       type: integer
 *                       example: 150
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
userRouter.get(
  "/analytics/summary",
  requireAuth,
  UserController.getAnalyticsSummary,
);

/**
 * @swagger
 * /api/user/analytics/daily:
 *   get:
 *     tags: [User]
 *     summary: Get daily scan activity for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: range
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           example: 7d
 *     responses:
 *       200:
 *         description: Daily scan counts for the authenticated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         example: 2026-04-14
 *                       count:
 *                         type: integer
 *                         example: 7
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
userRouter.get("/analytics/daily", requireAuth, UserController.getDailyTrend);

/**
 * @swagger
 * /api/user/scans:
 *   get:
 *     tags: [User]
 *     summary: Get recent scans for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 50
 *       - name: after
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Recent scan events for the authenticated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       device:
 *                         type: string
 *                         example: iPhone
 *                       ip:
 *                         type: string
 *                         example: 197.243.0.1
 *                       userAgent:
 *                         type: string
 *                         example: Mozilla/5.0
 *                       card:
 *                         type: object
 *                         properties:
 *                           cardId:
 *                             type: string
 *                             example: CARD_DEMO1
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
userRouter.get("/scans", requireAuth, UserController.getRecentScans);

/**
 * @swagger
 * /api/user/scans/export:
 *   get:
 *     tags: [User]
 *     summary: Export authenticated user's scans as CSV
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file of user's scan events
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
userRouter.get("/scans/export", requireAuth, UserController.exportScansCsv);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List registered users with pagination
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: size
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 25
 *     responses:
 *       200:
 *         description: Paginated users list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           role:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                           _count:
 *                             type: object
 *                             properties:
 *                               cards:
 *                                 type: integer
 *                     total:
 *                       type: integer
 *                       example: 50
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     size:
 *                       type: integer
 *                       example: 25
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
adminRouter.get("/users", AdminController.getAllUsers);

/**
 * @swagger
 * /api/admin/businesses:
 *   get:
 *     tags: [Admin]
 *     summary: List all registered businesses (paginated)
 *     description: Returns all business profiles with their owner info, cards, and menu count.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: size
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 25
 *     responses:
 *       200:
 *         description: Paginated list of businesses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     businesses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           category:
 *                             type: string
 *                           user:
 *                             type: object
 *                           cards:
 *                             type: array
 *                             items:
 *                               type: object
 *                           _count:
 *                             type: object
 *                             properties:
 *                               menus:
 *                                 type: integer
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     size:
 *                       type: integer
 *       403:
 *         description: Admin access required
 */
adminRouter.get("/businesses", AdminController.getAllBusinesses);

/**
 * @swagger
 * /api/admin/businesses/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get full business detail by ID
 *     description: Returns a single business with all menus, menu items, and linked card data.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Business profile ID
 *     responses:
 *       200:
 *         description: Full business detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     category:
 *                       type: string
 *                     menus:
 *                       type: array
 *                       items:
 *                         type: object
 *                     cards:
 *                       type: array
 *                       items:
 *                         type: object
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Business not found
 */
adminRouter.get("/businesses/:id", AdminController.getBusinessById);

/**
 * @swagger
 * /api/admin/payments:
 *   get:
 *     tags: [Admin]
 *     summary: List all payments across all users (paginated)
 *     description: |
 *       Returns all payment records system-wide.
 *       Supports optional filtering by status (PENDING, SUCCESS, FAILED).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: size
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 25
 *       - name: status
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [PENDING, SUCCESS, FAILED]
 *           example: SUCCESS
 *         description: Filter by payment status
 *     responses:
 *       200:
 *         description: Paginated list of all payments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     payments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           plan:
 *                             type: string
 *                             example: PLUS
 *                           amount:
 *                             type: number
 *                             example: 5000
 *                           status:
 *                             type: string
 *                             example: SUCCESS
 *                           user:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               email:
 *                                 type: string
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     size:
 *                       type: integer
 *       403:
 *         description: Admin access required
 */
adminRouter.get("/payments", AdminController.getAllPayments);

// ===========================================================
// USER ROUTES — /api/user
// ===========================================================

/**
 * @swagger
 * /api/user/analytics/summary:
 *   get:
 *     tags: [User]
 *     summary: Get authenticated user's scan summary
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Scan summary counts for the authenticated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     today:
 *                       type: integer
 *                       example: 5
 *                     week:
 *                       type: integer
 *                       example: 20
 *                     total:
 *                       type: integer
 *                       example: 150
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
userRouter.get(
  "/analytics/summary",
  requireAuth,
  UserController.getAnalyticsSummary,
);

/**
 * @swagger
 * /api/user/analytics/daily:
 *   get:
 *     tags: [User]
 *     summary: Get daily scan activity for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: range
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           example: 7d
 *     responses:
 *       200:
 *         description: Daily scan counts for the authenticated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         example: 2026-04-14
 *                       count:
 *                         type: integer
 *                         example: 7
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
userRouter.get("/analytics/daily", requireAuth, UserController.getDailyTrend);

/**
 * @swagger
 * /api/user/scans:
 *   get:
 *     tags: [User]
 *     summary: Get recent scans for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 50
 *       - name: after
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Recent scan events for the authenticated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       device:
 *                         type: string
 *                         example: iPhone
 *                       ip:
 *                         type: string
 *                         example: 197.243.0.1
 *                       userAgent:
 *                         type: string
 *                         example: Mozilla/5.0
 *                       card:
 *                         type: object
 *                         properties:
 *                           cardId:
 *                             type: string
 *                             example: CARD_DEMO1
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
userRouter.get("/scans", requireAuth, UserController.getRecentScans);

/**
 * @swagger
 * /api/user/scans/export:
 *   get:
 *     tags: [User]
 *     summary: Export authenticated user's scans as CSV
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file of user's scan events
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
userRouter.get("/scans/export", requireAuth, UserController.exportScansCsv);

// ===========================================================
// PUBLIC CARD VIEW ROUTES — /api/c (short URLs for NFC/QR)
// ===========================================================
// Mounted separately so the URL is clean: /api/c/:cardId
// instead of /api/cards/:cardId (avoids conflict with /cards/my)
export const publicCardRouter = Router();

/**
 * @swagger
 * /api/c/{cardId}:
 *   get:
 *     tags: [Public]
 *     summary: Get public card profile shown on NFC/QR scan
 *     parameters:
 *       - name: cardId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: CARD_AB3K2L
 *     responses:
 *       200:
 *         description: Public profile data
 *       404:
 *         description: Card not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
publicCardRouter.get("/:cardId", CardController.getPublicCard);

/**
 * @swagger
 * /api/c/{cardId}/vcard:
 *   get:
 *     tags: [Public]
 *     summary: Download vCard (.vcf) file for saving contact
 *     parameters:
 *       - name: cardId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: CARD_AB3K2L
 *     responses:
 *       200:
 *         description: vCard file download
 *       404:
 *         description: Card not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
publicCardRouter.get("/:cardId/vcard", CardController.downloadVCard);
