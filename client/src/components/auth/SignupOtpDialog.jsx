import { useEffect, useState } from "react";
import { MailCheck, X } from "lucide-react";
import { motion as Motion, AnimatePresence } from "motion/react";
import { useAuthStore } from "../../stores/useAuthStore";
import XButton from "../ui/animate/XButton";
import OTPInput from "@/components/lightswind-pro/otp-input";
import styles from "../../assets/css/GoogleOtpDialog.module.scss";

const CODE_LENGTH = 6;

const SignupOtpDialog = ({ open, email, pendingToken, onVerified, onCancel }) => {
    const verifyEmailSignupOtp = useAuthStore((state) => state.verifyEmailSignupOtp);
    const resendEmailSignupOtp = useAuthStore((state) => state.resendEmailSignupOtp);
    const loading = useAuthStore((state) => state.loading);
    const [code, setCode] = useState("");
    const [resendIn, setResendIn] = useState(45);

    useEffect(() => {
        if (!open) return;
        setCode("");
        setResendIn(45);
    }, [open, pendingToken]);

    useEffect(() => {
        if (!open || resendIn <= 0) return;
        const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [open, resendIn]);

    const submit = async (event) => {
        if (event) event.preventDefault();
        if (code.length !== CODE_LENGTH) return;
        const result = await verifyEmailSignupOtp(pendingToken, code);
        if (result.success) onVerified(result.user);
    };

    const resend = async () => {
        if (resendIn > 0) return;
        const result = await resendEmailSignupOtp(pendingToken);
        if (result.success) {
            setCode("");
            setResendIn(45);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <Motion.div
                    className={styles.overlay}
                    role="presentation"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <Motion.section
                        className={styles.dialog}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="signup-otp-title"
                        initial={{ opacity: 0, scale: 0.94, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 10 }}
                        transition={{ type: "spring", damping: 28, stiffness: 350 }}
                    >
                        <button
                            className={styles.closeButton}
                            type="button"
                            onClick={onCancel}
                            aria-label="Hủy xác thực"
                        >
                            <X size={20} />
                        </button>

                        <div className={styles.icon} aria-hidden="true">
                            <MailCheck size={24} />
                        </div>

                        <h2 id="signup-otp-title">Nhập mã xác nhận</h2>
                        <p className={styles.description}>
                            Mã 6 chữ số đã được gửi đến <strong>{email}</strong>
                        </p>

                        <form onSubmit={submit}>
                            <div className={styles.codeRow}>
                                <OTPInput
                                    length={CODE_LENGTH}
                                    value={code}
                                    onChange={setCode}
                                    disabled={loading}
                                    autoFocus={open}
                                />
                            </div>

                            <XButton
                                type="submit"
                                variant="primary"
                                size="lg"
                                loading={loading}
                                disabled={loading || code.length !== CODE_LENGTH}
                            >
                                Xác nhận
                            </XButton>
                        </form>

                        <div className={styles.resendContainer}>
                            <button
                                type="button"
                                className={styles.resendButton}
                                onClick={resend}
                                disabled={resendIn > 0}
                            >
                                {resendIn > 0 ? `Gửi lại mã sau ${resendIn}s` : "Gửi lại mã"}
                            </button>
                        </div>
                    </Motion.section>
                </Motion.div>
            )}
        </AnimatePresence>
    );
};

export default SignupOtpDialog;
