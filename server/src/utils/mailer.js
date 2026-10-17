import nodemailer from "nodemailer";

/**
 * Builds and sends OTP emails through the configured HTTPS or SMTP provider.
 * 
 * @param {string} email - Recipient email address
 * @param {string} otp - 6-digit OTP code
 */
const DEFAULT_EMAIL_TIMEOUT_MS = 10_000;
const BREVO_API_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

const buildOtpEmailHtml = ({ title, description, otp, isSignup }) => {
    const ignoreNote = isSignup
        ? "If you did not request this verification code, you can safely ignore this email."
        : "If you did not make this request, you can safely ignore this email. Your password will remain unchanged.";

    return `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c;">
            <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #e56d32; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.02em;">Shrimple</h1>
                <p style="color: #718096; margin: 4px 0 0 0; font-size: 14px;">Socializing made simple.</p>
            </div>

            <h2 style="font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 16px; color: #2d3748; text-align: center;">${title}</h2>

            <p style="font-size: 15px; line-height: 1.6; color: #4a5568; margin-bottom: 24px; text-align: center;">
                ${description} This code is only valid for <strong>5 minutes</strong>.
            </p>

            <div style="background-color: #f7fafc; border: 1px dashed #cbd5e0; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #e56d32;">${otp}</span>
            </div>

            <p style="font-size: 13px; line-height: 1.5; color: #718096; margin-bottom: 0; text-align: center;">
                ${ignoreNote}
            </p>

            <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 24px 0;" />

            <div style="text-align: center; font-size: 12px; color: #a0aec0;">
                &copy; ${new Date().getFullYear()} Shrimple Life. All rights reserved.
            </div>
        </div>
    `;
};

const buildOtpEmailText = ({ title, description, otp }) =>
    `${title}\n\n${description}\n\nYour verification code is: ${otp}\nThis code is valid for 5 minutes.\n\nIf you did not make this request, you can safely ignore this email.`;

const sendViaBrevo = async ({ apiKey, senderEmail, senderName, email, subject, htmlContent, textContent, timeoutMs }) => {
    if (apiKey.startsWith("xsmtpsib-")) {
        console.warn("⚠️ BREVO_API_KEY starts with 'xsmtpsib-' (SMTP relay key). Brevo HTTP API requires a v3 API key starting with 'xkeysib-' from SMTP & API -> API Keys.");
    }

    const response = await fetch(BREVO_API_ENDPOINT, {
        method: "POST",
        headers: {
            "accept": "application/json",
            "content-type": "application/json",
            "api-key": apiKey
        },
        body: JSON.stringify({
            sender: {
                name: senderName || "Shrimple Support",
                email: senderEmail
            },
            to: [{ email }],
            subject,
            htmlContent,
            textContent
        }),
        signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`Brevo API HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
    }
};

const sendViaWebhook = async ({ webhookUrl, webhookSecret, email, subject, htmlContent, timeoutMs }) => {
    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            to: email,
            subject,
            html: htmlContent,
            secret: webhookSecret || undefined
        }),
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
        throw new Error(`Email webhook responded with HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        const payload = await response.json();
        if (payload && payload.success === false) {
            throw new Error(payload.error || "Email webhook reported failure");
        }
    }
};

export const sendOtpEmail = async (email, otp, purpose = "password-reset") => {
    const isSignup = purpose === "google-signup" || purpose === "email-signup";
    const isGoogleSignup = purpose === "google-signup";
    const title = isSignup ? "Verify Your New Account" : "Reset Your Password";
    const description = isSignup
        ? `A new Shrimple account is being created${isGoogleSignup ? " with Google" : ""}. Enter the verification code below to confirm this email address.`
        : "We received a request to reset the password for your Shrimple account. Use the verification code below to proceed.";
    const subject = isSignup
        ? "[Shrimple] Verify your new account"
        : "[Shrimple] Reset Your Password OTP";
    // 1. Always log the OTP to the terminal for extremely easy local development and debugging
    console.log("\n========================================");
    console.log(`🔑 ${isSignup ? "SIGNUP" : "PASSWORD RESET"} OTP`);
    console.log(`✉️  EMAIL: ${email}`);
    console.log(`🔢 CODE:  ${otp}`);
    console.log(`⏱️  EXPIRES IN: 5 minutes`);
    console.log("========================================\n");

    const emailUser = process.env.EMAIL_USER ? process.env.EMAIL_USER.trim() : "";
    const emailPass = process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/\s+/g, "") : "";
    const emailFrom = process.env.EMAIL_FROM ? process.env.EMAIL_FROM.trim() : emailUser;
    const senderName = process.env.EMAIL_SENDER_NAME ? process.env.EMAIL_SENDER_NAME.trim() : "Shrimple Support";
    const brevoApiKey = (process.env.BREVO_API_KEY ? process.env.BREVO_API_KEY.trim() : "")
        || (emailPass.startsWith("xkeysib-") ? emailPass : "");
    const webhookUrl = process.env.EMAIL_WEBHOOK_URL ? process.env.EMAIL_WEBHOOK_URL.trim() : "";
    const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET ? process.env.EMAIL_WEBHOOK_SECRET.trim() : "";
    const parsedTimeout = Number.parseInt(process.env.EMAIL_TIMEOUT_MS || "", 10);
    const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0
        ? parsedTimeout
        : DEFAULT_EMAIL_TIMEOUT_MS;

    const htmlContent = buildOtpEmailHtml({ title, description, otp, isSignup });
    const textContent = buildOtpEmailText({ title, description, otp });

    // 2. Primary production transport: Brevo HTTP API over HTTPS port 443 (works on Render Free, 300 emails/day)
    if (brevoApiKey) {
        if (!emailFrom) {
            console.error("❌ BREVO_API_KEY is set, but EMAIL_FROM / EMAIL_USER sender address is missing.");
            return { success: false, error: "Sender email address is not configured." };
        }
        try {
            await sendViaBrevo({
                apiKey: brevoApiKey,
                senderEmail: emailFrom,
                senderName,
                email,
                subject,
                htmlContent,
                textContent,
                timeoutMs
            });
            console.log(`📧 OTP email (${purpose}) successfully sent via Brevo HTTPS API to: ${email}`);
            return { success: true, sent: true };
        } catch (error) {
            console.error("❌ Failed to send email via Brevo HTTPS API:", error.message);
            return { success: false, error: error.message };
        }
    }

    // 3. Optional HTTPS webhook transport (e.g. Google Apps Script)
    if (webhookUrl) {
        try {
            await sendViaWebhook({ webhookUrl, webhookSecret, email, subject, htmlContent, timeoutMs });
            console.log(`📧 OTP email (${purpose}) successfully sent via HTTPS webhook to: ${email}`);
            return { success: true, sent: true };
        } catch (error) {
            console.error("❌ Failed to send email via HTTPS webhook:", error.message);
            return { success: false, error: error.message };
        }
    }

    // 4. Fallback to console when no Brevo, webhook, or SMTP credentials are configured
    if (!emailUser || !emailPass) {
        console.warn("⚠️ Email credentials (BREVO_API_KEY, EMAIL_WEBHOOK_URL, or EMAIL_USER & EMAIL_PASS) are not set in .env.");
        console.warn("👉 Fell back to console logging the OTP code. No actual email was sent.");
        return { success: true, loggedToConsole: true };
    }

    // 5. SMTP transport via Nodemailer (for local/hosts with open SMTP ports) with explicit timeouts
    try {
        const transporterOpts = {
            service: process.env.EMAIL_SERVICE || "gmail",
            auth: {
                user: emailUser,
                pass: emailPass
            },
            connectionTimeout: timeoutMs,
            greetingTimeout: timeoutMs,
            socketTimeout: timeoutMs + 5_000
        };

        // Fallback to custom SMTP host/port if provided
        if (process.env.EMAIL_HOST) {
            transporterOpts.host = process.env.EMAIL_HOST;
            transporterOpts.port = parseInt(process.env.EMAIL_PORT || "587", 10);
            transporterOpts.secure = process.env.EMAIL_SECURE === "true";
            delete transporterOpts.service; // Use host instead of service
        }

        const transporter = nodemailer.createTransport(transporterOpts);

        await transporter.sendMail({
            from: `"${senderName}" <${emailFrom}>`,
            to: email,
            subject,
            text: textContent,
            html: htmlContent
        });

        console.log(`📧 OTP email (${purpose}) successfully sent via SMTP to: ${email}`);
        return { success: true, sent: true };
    } catch (error) {
        console.error("❌ Failed to send email via nodemailer:", error.message);
        return { success: false, error: error.message };
    }
};
