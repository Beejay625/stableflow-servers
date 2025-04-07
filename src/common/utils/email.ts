import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, Transporter } from "nodemailer";

@Injectable()
export class MailService {
  private transporter: Transporter;
  private logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {
    this.transporter = createTransport({
      host: this.configService.get<string>("email.host"),
      port: 587,
      auth: {
        user: this.configService.get<string>("email.username"),
        pass: this.configService.get<string>("email.password"),
      },
      secure: false,
    });
  }

  async sendMail(
    sendee: string | string[],
    title: string,
    message: {
      cc?: Array<string>;
      html?: string;
      text?: string;
      attachments?: Array<{ filename: string; content: Buffer | string }>;
    },
    senderName?: string,
  ): Promise<any> {
    if (!sendee) return;

    try {
      this.logger.log(`Sending email to ${sendee}...`);

      const mailOptions = {
        from: `${senderName || "StableFlow"} <${this.configService.get<string>("email.email")}>`,
        to: sendee,
        subject: title,
        text: message.text,
        html: message.html,
        attachments: message?.attachments || [],
      };

      return await new Promise((resolve, reject) => {
        this.transporter.sendMail(mailOptions, (err, info) => {
          if (err) {
            this.logger.error(`Error while sending email: ${err.message}`);
            reject(new Error(`Failed to send email: ${err.message}`));
          } else {
            this.logger.log(`Email sent successfully: ${info.response}`);
            resolve(info);
          }
        });
      });
    } catch (exp) {
      this.logger.error(`Unexpected error in sendMail: ${exp}`);
      throw new Error("Unexpected error while sending email.");
    }
  }

  /**
   * Send an email - Compatibility method with the old implementation
   * @param to - Recipient email address
   * @param subject - Email subject
   * @param html - Email content in HTML
   * @returns Promise<boolean> - Whether the email was sent successfully
   */
  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      await this.sendMail(to, subject, { html });
      return true;
    } catch (error) {
      this.logger.error("Failed to send email:", error);
      return false;
    }
  }

  /**
   * Send OTP email
   * @param to - Recipient email address
   * @param otp - One-time password
   * @returns Promise<boolean> - Whether the email was sent successfully
   */
  async sendOtpEmail(to: string, otp: string): Promise<boolean> {
    const subject = "Your Verification Code";
    const html = `
      <h1>Authentication Code</h1>
      <p>Your verification code is: <strong>${otp}</strong></p>
      <p>This code will expire in 5 minutes.</p>
    `;

    return this.sendEmail(to, subject, html);
  }
}
