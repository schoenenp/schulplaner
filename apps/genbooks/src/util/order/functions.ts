import { createHash, timingSafeEqual } from 'crypto';
import nodemailer from 'nodemailer';
import { env } from '@/env';
import { logger } from "@/util/logger";

const ABC = 'ABCEFGHJKLNPQSTUVWXYZ'

export default function createOrderKey(orderNo:number, orderType = "M"){
    let randomKey = orderType.split("")[0]?.toLocaleUpperCase() ?? orderType

    for(let i = 0; i < 2; i++){
        const randomNumber = Math.floor(Math.random() * ABC.length)
        randomKey += ABC[randomNumber]
    }

    return `ORD-${randomKey}-${orderNo}`
}


export function createCancelKey(key: string, secret: string = env.CANCEL_SECRET): string {
    // Create a hash using SHA-256
    const hash = createHash('sha256');
    hash.update(key + secret);
    return hash.digest('hex');
}

export function verifyCancelKey(key: string, hash: string, secret: string = env.CANCEL_SECRET): boolean {
    // Verify using timing-safe compare to avoid side-channel leaks.
    const expectedHash = createCancelKey(key, secret);
    if (hash.length !== expectedHash.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
}

export async function sendOrderVerification(to: string, subject: string, html: string)
{
  const smtpPort = env.EMAIL_SERVER_PORT;
  const smtpSecure = smtpPort === 465;

  const transporter = nodemailer.createTransport({
    host:env.EMAIL_SERVER_HOST,
    port: smtpPort,
    secure: smtpSecure,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    auth:{
      user: env.EMAIL_SERVER_USER,
      pass: env.EMAIL_SERVER_PASSWORD
    }
  })
  const info = await transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    bcc: [ env.SHOP_EMAIL ]
  })

  logger.info("order_verification_email_sent", { messageId: info.messageId });
  return info;
}
