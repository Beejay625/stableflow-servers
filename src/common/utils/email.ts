import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private transporter: Transporter;
  private logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {
    this.transporter = createTransport({
      host: this.configService.get<string>('NOREPLY_HOST'),
      port: 465,
      auth: {
        user: this.configService.get<string>('NOREPLY_USERNAME'),
        pass: this.configService.get<string>('NOREPLY_PASSWORD'),
      },
      secure: true,
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
        from: `${senderName || 'Music App'} <${this.configService.get<string>('NOREPLY_EMAIL')}>`,
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
      throw new Error('Unexpected error while sending email.');
    }
  }
}
