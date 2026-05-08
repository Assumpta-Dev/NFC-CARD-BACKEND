// ===========================================================
// EMAIL SERVICE
// ===========================================================
// Handles all outgoing transactional emails using Nodemailer.
// Uses Gmail SMTP with an App Password (not the account password).
//
// Emails sent:
//   1. Welcome email  — sent after successful account registration
//   2. Password reset — sent when user requests a password reset link
//
// Gmail App Password setup:
//   1. Enable 2FA on your Google account
//   2. Go to: Google Account → Security → App Passwords
//   3. Generate a password for "Mail" → paste in GMAIL_APP_PASSWORD env var
//
// All config is read from environment variables — never hardcoded.
// ===========================================================

import nodemailer from "nodemailer";

// ===========================================================
// SMTP TRANSPORTER
// ===========================================================
// Reuse a single transporter instance across all email sends.
// Creating a new transporter per email would open/close SMTP
// connections unnecessarily.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,       // e.g. uwamariyaassumpta24@gmail.com
    pass: process.env.GMAIL_APP_PASSWORD, // App password from Google Account settings
  },
});

const FROM = `"E-Card Platform" <${process.env.GMAIL_USER}>`;
const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://my-nfc-business-cards.netlify.app";

// ===========================================================
// WELCOME EMAIL
// ===========================================================
// Sent immediately after a user successfully creates an account.
// Includes their name and a link to their dashboard.
export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const dashboardUrl = `${FRONTEND_URL}/dashboard`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Welcome to E-Card — Your Digital Card is Ready 🎉",
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Welcome to E-Card</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#DE3A16;padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
                ✦ E-Card
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
                Digital Business Cards
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 12px;color:#1a1a1a;font-size:22px;font-weight:700;">
                Welcome, ${name}! 👋
              </h2>
              <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.7;">
                Your E-Card account has been created successfully. You now have a
                powerful digital business card that you can share with anyone — just
                one tap or scan away.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#fdf3f0;border-left:4px solid #DE3A16;border-radius:0 8px 8px 0;padding:16px 20px;">
                    <p style="margin:0;color:#DE3A16;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
                      What you can do next
                    </p>
                    <ul style="margin:10px 0 0;padding-left:18px;color:#555;font-size:14px;line-height:2;">
                      <li>Complete your profile with your photo and bio</li>
                      <li>Add your social links (LinkedIn, Instagram, etc.)</li>
                      <li>Share your card link or activate your physical NFC card</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#DE3A16;border-radius:10px;">
                    <a href="${dashboardUrl}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.2px;">
                      Go to My Dashboard →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;border-top:1px solid #eee;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#999;font-size:12px;line-height:1.6;">
                You received this email because you created an account on E-Card.<br/>
                If this wasn't you, please ignore this email.
              </p>
              <p style="margin:12px 0 0;color:#ccc;font-size:11px;">
                © ${new Date().getFullYear()} E-Card Platform. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  });
}

// ===========================================================
// PASSWORD RECOVERED CONFIRMATION EMAIL
// ===========================================================
// Sent after the user successfully resets their password.
// Alerts them in case it wasn't them — security notification.
export async function sendPasswordRecoveredEmail(
  to: string,
  name: string,
): Promise<void> {
  const loginUrl = `${FRONTEND_URL}/login`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Your E-Card Password Has Been Reset ✅",
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Password Reset Successful</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#DE3A16;padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
                ✦ E-Card
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
                Password Reset Successful
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 12px;color:#1a1a1a;font-size:22px;font-weight:700;">
                Hi ${name}, your password has been recovered ✅
              </h2>
              <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.7;">
                Your E-Card account password was successfully reset.
                You can now sign in with your new password.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#fff8f7;border:1px solid #f5d0c8;border-radius:10px;padding:16px 20px;">
                    <p style="margin:0;color:#DE3A16;font-size:13px;font-weight:700;">
                      🔒 Wasn't you?
                    </p>
                    <p style="margin:6px 0 0;color:#777;font-size:13px;">
                      If you did not reset your password, your account may be compromised.
                      Please contact our support team immediately.
                    </p>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#DE3A16;border-radius:10px;">
                    <a href="${loginUrl}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.2px;">
                      Sign In Now →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;border-top:1px solid #eee;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#999;font-size:12px;line-height:1.6;">
                This is an automated security notification from E-Card.<br/>
                If you did not make this change, please contact support.
              </p>
              <p style="margin:12px 0 0;color:#ccc;font-size:11px;">
                © ${new Date().getFullYear()} E-Card Platform. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  });
}

// ===========================================================
// PASSWORD RESET EMAIL
// ===========================================================
// Sent when a user requests a password reset.
// The reset link contains a secure token that expires in 1 hour.
// Token is hashed before storing in DB — only the raw token is emailed.
export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetToken: string,
): Promise<void> {
  // Frontend handles the reset form at /reset-password?token=xxx
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Reset Your E-Card Password",
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#DE3A16;padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
                ✦ E-Card
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
                Password Reset Request
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 12px;color:#1a1a1a;font-size:22px;font-weight:700;">
                Hi ${name}, reset your password
              </h2>
              <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.7;">
                We received a request to reset the password for your E-Card account.
                Click the button below to choose a new password.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#fff8f7;border:1px solid #f5d0c8;border-radius:10px;padding:16px 20px;">
                    <p style="margin:0;color:#DE3A16;font-size:13px;font-weight:700;">
                      ⏱ This link expires in 1 hour
                    </p>
                    <p style="margin:6px 0 0;color:#777;font-size:13px;">
                      If you didn't request a password reset, you can safely ignore this email.
                      Your password will not change.
                    </p>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#DE3A16;border-radius:10px;">
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.2px;">
                      Reset My Password →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#aaa;font-size:12px;line-height:1.6;">
                Or copy and paste this link into your browser:<br/>
                <span style="color:#DE3A16;word-break:break-all;">${resetUrl}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;border-top:1px solid #eee;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#999;font-size:12px;line-height:1.6;">
                This password reset link will expire in 1 hour for your security.<br/>
                If you didn't request this, no action is needed.
              </p>
              <p style="margin:12px 0 0;color:#ccc;font-size:11px;">
                © ${new Date().getFullYear()} E-Card Platform. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  });
}
