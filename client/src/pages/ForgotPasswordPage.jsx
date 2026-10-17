import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion as Motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Check, Mail, KeyRound, LockKeyhole } from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import authStyles from '../assets/css/SignInPage.module.scss';
import styles from '../assets/css/ForgotPasswordPage.module.scss';
import SideRays from '../components/ui/animate/SideRays';
import XInput from '../components/ui/animate/XInput';
import XButton from '../components/ui/animate/XButton';
import OTPInput from '@/components/lightswind-pro/otp-input';

const footerLinks = ['about', 'download', 'help', 'terms', 'privacy', 'cookies', 'accessibility', 'advertising'];

const ForgotPasswordPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const reducedMotion = useReducedMotion();
    const { forgotPassword, verifyOtp, resetPassword, loading } = useAuthStore();
    const headingRef = useRef(null);
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [resendTimer, setResendTimer] = useState(60);
    const [isResendDisabled, setIsResendDisabled] = useState(true);
    const [error, setError] = useState('');

    const requirements = {
        minLength: newPassword.length >= 6,
        hasNumber: /\d/.test(newPassword),
        hasLetter: /[a-zA-Z]/.test(newPassword),
    };
    const score = Object.values(requirements).filter(Boolean).length
        + Number(newPassword.length >= 10 && /[A-Z]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword));
    const strength = ['empty', 'weak', 'fair', 'good', 'strong'][score];
    const title = t(`recovery.title${step}`);
    const submitLabel = t(`recovery.submit${step}`);

    useEffect(() => {
        if (step !== 2 || !isResendDisabled) return;
        const interval = setInterval(() => {
            setResendTimer((previous) => Math.max(0, previous - 1));
        }, 1000);
        return () => clearInterval(interval);
    }, [step, isResendDisabled]);

    useEffect(() => {
        if (resendTimer === 0) setIsResendDisabled(false);
    }, [resendTimer]);

    useEffect(() => {
        // Announce a new step without taking focus on the initial page load.
        if (step > 1) headingRef.current?.focus();
    }, [step]);

    const restartTimer = () => {
        setResendTimer(60);
        setIsResendDisabled(true);
    };

    const handleSendOtp = async (event) => {
        event.preventDefault();
        setError('');
        const result = await forgotPassword(email);
        if (result?.success) {
            setStep(2);
            restartTimer();
        } else setError('sendError');
    };

    const handleResendOtp = async () => {
        setError('');
        const result = await forgotPassword(email);
        if (result?.success) {
            restartTimer();
            setOtp('');
        } else setError('sendError');
    };

    const handleVerifyOtp = async (event) => {
        event.preventDefault();
        setError('');
        if (otp.length !== 6) {
            setError('incompleteCode');
            return;
        }
        const result = await verifyOtp(email, otp);
        if (result?.success) setStep(3);
        else setError('verifyError');
    };

    const handleResetPassword = async (event) => {
        event.preventDefault();
        setError('');
        if (!Object.values(requirements).every(Boolean)) {
            setError('requirementsError');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('mismatch');
            return;
        }
        const result = await resetPassword(email, otp, newPassword);
        if (result?.success) navigate('/signin');
        else setError('resetError');
    };

    const goBack = () => {
        setError('');
        if (step === 2) setOtp('');
        if (step === 3) {
            setNewPassword('');
            setConfirmPassword('');
        }
        setStep((previous) => previous - 1);
    };

    return (
        <div className={`${authStyles['page-wrapper']} ${reducedMotion ? styles['static-background'] : ''}`}>
            {!reducedMotion && <SideRays origin="top-left" speed={1.6} rayColor1="#f97316" rayColor2="#fb923c" intensity={1.8} spread={2.2} opacity={0.65} falloff={1.5} />}
            <main className={authStyles['main-content']}>
                <div className={authStyles['brand-column']}>
                    <Motion.div className={authStyles['brand-content']} initial={reducedMotion ? false : { opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}>
                        <Motion.img src="/logo_remove_bg.png" alt="Shrimple" className={authStyles['brand-logo']} animate={reducedMotion ? undefined : { y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} />
                    </Motion.div>
                </div>
                <div className={authStyles['auth-column']}>
                    <div className={authStyles['mobile-logo-wrapper']}>
                        <img src="/logo_remove_bg.png" alt="Shrimple" className={authStyles['mobile-logo']} />
                    </div>
                    <Motion.div className={authStyles['auth-card']} initial={reducedMotion ? false : { opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}>
                        <p className={styles.eyebrow}>{t('recovery.eyebrow')}</p>
                        <h1 ref={headingRef} tabIndex={-1} className={`${authStyles['hero-heading']} ${styles.title}`}>{title}</h1>
                        <p className={styles.subtitle}>
                            {step === 2 ? <>{t('recovery.subtitle2')} <strong>{email}</strong>.</> : t(`recovery.subtitle${step}`)}
                        </p>
                        <ol className={styles.steps} aria-label={t('recovery.progress')}>
                            {[1, 2, 3].map((number) => (
                                <li key={number} className={number <= step ? styles.active : ''} aria-current={number === step ? 'step' : undefined}>
                                    <span aria-hidden="true">{number < step ? <Check size={14} /> : number}</span>
                                    <span>{t(`recovery.step${number}`)}</span>
                                </li>
                            ))}
                        </ol>
                        <form className={authStyles['auth-form']} onSubmit={step === 1 ? handleSendOtp : step === 2 ? handleVerifyOtp : handleResetPassword} aria-busy={loading}>
                            {step === 1 && <XInput id="recovery-email" name="email" type="email" label={t('recovery.email')} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={loading} />}
                            {step === 2 && <>
                                <div className={styles['code-group']} role="group" aria-label={t('recovery.code')}>
                                    <p>{t('recovery.code')}</p>
                                    <OTPInput length={6} value={otp} onChange={setOtp} disabled={loading} className={styles.otp} slotClassName={styles['otp-slot']} error={Boolean(error)} />
                                </div>
                                <div className={styles.resend}>
                                    <span>{isResendDisabled ? t('recovery.resendIn', { seconds: resendTimer }) : t('recovery.noCode')}</span>
                                    <button type="button" disabled={isResendDisabled || loading} onClick={handleResendOtp}>{t('recovery.resend')}</button>
                                </div>
                            </>}
                            {step === 3 && <>
                                <XInput id="new-password" name="newPassword" type="password" label={t('recovery.newPassword')} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required disabled={loading} aria-describedby="password-requirements" />
                                <XInput id="confirm-password" name="confirmPassword" type="password" label={t('recovery.confirmPassword')} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required disabled={loading} />
                                <div className={styles.strength}>
                                    <div className={styles['strength-bar']} aria-hidden="true">
                                        {[1, 2, 3, 4].map((number) => <span key={number} className={number <= score ? styles[strength] : ''} />)}
                                    </div>
                                    <p>{t('recovery.strength')}: <strong>{t(`recovery.${strength}`)}</strong></p>
                                    <ul id="password-requirements">
                                        {Object.entries(requirements).map(([name, met]) => <li key={name} className={met ? styles.met : ''}><Check size={14} aria-hidden="true" />{t(`recovery.${name}`)}</li>)}
                                    </ul>
                                </div>
                            </>}
                            {error && <p className={styles.error} role="alert">{t(`recovery.${error}`)}</p>}
                            <XButton type="submit" size="lg" loading={loading} aria-label={submitLabel} shimmer={!reducedMotion} className={styles.submit}>
                                {submitLabel}{step === 1 ? <Mail size={18} /> : step === 2 ? <KeyRound size={18} /> : <LockKeyhole size={18} />}
                            </XButton>
                            <span className={styles['sr-only']} role="status">{loading ? t('common.loading') : ''}</span>
                        </form>
                        <div className={styles.back}>
                            {step > 1 ? <button type="button" onClick={goBack} disabled={loading}><ArrowLeft size={16} />{t('recovery.back')}</button> : <Link to="/signin"><ArrowLeft size={16} />{t('recovery.signIn')}</Link>}
                        </div>
                    </Motion.div>
                </div>
            </main>
            <footer className={authStyles['x-footer']}>
                <nav className={authStyles['footer-nav']}>
                    {footerLinks.map((name) => <a key={name} href={`#${name}`} onClick={(event) => event.preventDefault()}>{t(`recovery.footer.${name}`)}</a>)}
                    <span>© 2026 Shrimple Corp.</span>
                </nav>
            </footer>
        </div>
    );
};

export default ForgotPasswordPage;
