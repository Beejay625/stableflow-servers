/**
 * Email templates for the application
 */

/**
 * OTP email template
 * @param otp - One-time password
 * @returns HTML template string
 */
export const otpEmailTemplate = (otp: string): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #333;">Your One-Time Password</h1>
      </div>
      <div style="margin-bottom: 30px; color: #666; font-size: 16px; line-height: 1.5;">
        <p>Hello,</p>
        <p>You requested a one-time password (OTP) for StableFlow. Please use the following code to complete your authentication:</p>
        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 4px;">
          ${otp}
        </div>
        <p>This code will expire in 15 minutes.</p>
        <p>If you didn't request this OTP, please ignore this email.</p>
        <p>Thank you,<br>The StableFlow Team</p>
      </div>
    </div>
  `;
};

/**
 * Welcome email template
 * @param name - User's name
 * @returns HTML template string
 */
export const welcomeEmailTemplate = (name: string): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #333;">Welcome to StableFlow!</h1>
      </div>
      <div style="margin-bottom: 30px; color: #666; font-size: 16px; line-height: 1.5;">
        <p>Hello ${name},</p>
        <p>Welcome to StableFlow! We're excited to have you on board.</p>
        <p>With StableFlow, you can:</p>
        <ul>
          <li>Manage your business operations efficiently</li>
          <li>Set up secure payment processing</li>
          <li>Track your financial performance</li>
        </ul>
        <p>If you have any questions or need assistance, feel free to contact our support team.</p>
        <p>Best regards,<br>The StableFlow Team</p>
      </div>
    </div>
  `;
};

/**
 * Password reset email template
 * @param resetLink - Password reset link
 * @returns HTML template string
 */
export const passwordResetEmailTemplate = (resetLink: string): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #333;">Password Reset Request</h1>
      </div>
      <div style="margin-bottom: 30px; color: #666; font-size: 16px; line-height: 1.5;">
        <p>Hello,</p>
        <p>We received a request to reset your password for your StableFlow account.</p>
        <p>To reset your password, please click the button below:</p>
        <div style="text-align: center; margin: 25px 0;">
          <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
        </div>
        <p>If you didn't request a password reset, you can safely ignore this email.</p>
        <p>This link will expire in 1 hour.</p>
        <p>Thank you,<br>The StableFlow Team</p>
      </div>
    </div>
  `;
}; 