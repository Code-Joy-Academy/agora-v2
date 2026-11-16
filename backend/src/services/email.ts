
import { Resend } from 'resend';
import { config } from '../config/env.js';

const resend = new Resend(config.resendApiKey);

interface SendLoginEmailOptions {
    to: string;
    token: string;
}

export async function sendLoginEmail({
                                         to,
                                         token,
                                     }: SendLoginEmailOptions): Promise<void> {
    const loginUrl = new URL(
        '/auth/verify',
        config.frontendUrl,
    );

    loginUrl.searchParams.set('token', token);

    const { error } = await resend.emails.send({
        from: config.emailFrom,
        to,
        subject: 'Your Agora sign-in link',
        html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222">
        <h2>Sign in to Agora</h2>
        <p>Use the button below to securely access your Agora account.</p>
        <p style="margin:32px 0">
          <a href="${loginUrl.toString()}"
             style="background:#2457d6;color:white;padding:14px 24px;text-decoration:none;border-radius:8px">
            Sign in to Agora
          </a>
        </p>
        <p>This link expires in 15 minutes and can only be used once.</p>
        <p>If you did not request this link, you can safely ignore this email.</p>
      </div>
    `,
    });

    if (error) {
        console.error('[EMAIL] Resend failed:', error);
        throw new Error('Unable to send sign-in email.');
    }
}
