import nodemailer from "nodemailer";

/**
 * Sends a beautifully styled reset password OTP email.
 * If SMTP credentials are not configured, it gracefully logs the OTP to the server console.
 * 
 * @param {string} email - Recipient email address
 * @param {string} otp - 6-digit OTP code
 */
export const sendOtpEmail = async (email, otp, purpose = "password-reset") => {
    const isSignup = purpose === "google-signup" || purpose === "email-signup";
    const isGoogleSignup = purpose === "google-signup";
    const title = isSignup ? "Verify Your New Account" : "Reset Your Password";
    const description = isGoogleSignup
        ? `A new Shrimple account is being created${isGoogleSignup ? " with Google" : ""}. Enter the verification code below to confirm this email address.`
        : "We received a request to reset the password for your Shrimple account. Use the verification code below to proceed.";
    const subject = isGoogleSignup
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

    if (!emailUser || !emailPass) {
        console.warn("⚠️ SMTP credentials (EMAIL_USER & EMAIL_PASS) are not set in .env.");
        console.warn("👉 Fell back to console logging the OTP code. No actual email was sent.");
        return { success: true, loggedToConsole: true };
    }

    try {
        // Create transporter (by default assuming Gmail App Password or custom SMTP)
        // If the user specifies host/port in env, we can support those as well
        const transporterOpts = {
            service: process.env.EMAIL_SERVICE || "gmail",
            auth: {
                user: emailUser,
                pass: emailPass
            }
        };

        // Fallback to custom SMTP host/port if provided
        if (process.env.EMAIL_HOST) {
            transporterOpts.host = process.env.EMAIL_HOST;
            transporterOpts.port = parseInt(process.env.EMAIL_PORT || "587");
            transporterOpts.secure = process.env.EMAIL_SECURE === "true";
            delete transporterOpts.service; // Use host instead of service
        }

        const transporter = nodemailer.createTransport(transporterOpts);

        const htmlContent = `
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
                    If you did not make this request, you can safely ignore this email. Your password will remain unchanged.
                </p>
                
                <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 24px 0;" />
                
                <div style="text-align: center; font-size: 12px; color: #a0aec0;">
                    &copy; ${new Date().getFullYear()} Shrimple Life. All rights reserved.
                </div>
            </div>
        `;

        await transporter.sendMail({
            from: `"Shrimple Support" <${emailUser}>`,
            to: email,
            subject,
            html: htmlContent
        });

        console.log(`📧 OTP email successfully sent to: ${email}`);
        return { success: true, sent: true };
    } catch (error) {
        console.error("❌ Failed to send email via nodemailer:", error);
        return { success: false, error: error.message };
    }
};
