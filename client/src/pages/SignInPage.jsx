import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { toast } from 'sonner';
import { motion as Motion } from 'motion/react';
import styles from '../assets/css/SignInPage.module.scss';
import { useAuthStore } from '../stores/useAuthStore';
import GoogleOtpDialog from '../components/auth/GoogleOtpDialog';
import SideRays from '../components/ui/animate/SideRays';
import XInput from '../components/ui/animate/XInput';
import XButton from '../components/ui/animate/XButton';

const SignInPage = () => {
    const navigate = useNavigate();
    const { signIn, googleLogin, loading } = useAuthStore();
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [rememberMe, setRememberMe] = useState(false);
    const [googleVerification, setGoogleVerification] = useState(null);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const result = await signIn(formData.email, formData.password);
            if (result.success) {
                const user = useAuthStore.getState().user;
                if (user?.isProfileComplete) {
                    navigate('/');
                } else {
                    navigate('/complete-profile');
                }
            }
        } catch {
            // Error handled in store
        }
    };

    const handleGoogleSuccess = async (credentialResponse) => {
        try {
            const result = await googleLogin(credentialResponse.credential);
            if (result.success) {
                if (result.requiresOtp) {
                    setGoogleVerification({ pendingToken: result.pendingToken, email: result.email });
                    return;
                }
                const user = useAuthStore.getState().user;
                if (user?.isProfileComplete) {
                    navigate('/');
                } else {
                    navigate('/complete-profile');
                }
            }
        } catch {
            toast.error('Đăng nhập Google thất bại');
        }
    };

    return (
        <div className={styles['page-wrapper']}>
            <GoogleOtpDialog
                open={Boolean(googleVerification)}
                email={googleVerification?.email || ''}
                pendingToken={googleVerification?.pendingToken || ''}
                onCancel={() => setGoogleVerification(null)}
                onVerified={() => {
                    setGoogleVerification(null);
                    navigate('/complete-profile');
                }}
            />

            {/* React Bits Animated Background: SideRays */}
            <SideRays
                origin="top-left"
                speed={1.6}
                rayColor1="#f97316"
                rayColor2="#fb923c"
                intensity={1.8}
                spread={2.2}
                opacity={0.65}
                falloff={1.5}
            />

            <div className={styles['main-content']}>
                {/* Left Section: Iconic Brand Stage */}
                <div className={styles['brand-column']}>
                    <Motion.div 
                        className={styles['brand-content']}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <Motion.img 
                            src="/logo_remove_bg.png" 
                            alt="Logo" 
                            className={styles['brand-logo']}
                            animate={{ y: [0, -8, 0] }}
                            transition={{ 
                                duration: 4, 
                                repeat: Infinity, 
                                ease: 'easeInOut' 
                            }}
                        />
                    </Motion.div>
                </div>

                {/* Right Section: X-Style Auth Form */}
                <div className={styles['auth-column']}>
                    {/* Mobile Brand Logo */}
                    <div className={styles['mobile-logo-wrapper']}>
                        <img 
                            src="/logo_remove_bg.png" 
                            alt="Logo" 
                            className={styles['mobile-logo']} 
                        />
                    </div>

                    <Motion.div 
                        className={styles['auth-card']}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <h1 className={styles['hero-heading']}>Đăng nhập vào Shrimple</h1>

                        {/* Social Login */}
                        <div className={styles['social-wrapper']}>
                            <div className={styles['google-btn-container']}>
                                <GoogleLogin
                                    onSuccess={handleGoogleSuccess}
                                    onError={() => toast.error('Google Login Failed')}
                                    theme="filled_black"
                                    shape="pill"
                                    text="signin_with"
                                    width="100%"
                                />
                            </div>
                        </div>

                        {/* Divider */}
                        <div className={styles.divider}>
                            <span className={styles['divider-line']} />
                            <span className={styles['divider-text']}>hoặc</span>
                            <span className={styles['divider-line']} />
                        </div>

                        {/* Credentials Form */}
                        <form onSubmit={handleSubmit} className={styles['auth-form']}>
                            <XInput
                                id="signin-email"
                                name="email"
                                type="email"
                                label="Email hoặc tên người dùng"
                                autoComplete="email"
                                value={formData.email}
                                onChange={handleChange}
                                required
                            />

                            <XInput
                                id="signin-password"
                                name="password"
                                type="password"
                                label="Mật khẩu"
                                autoComplete="current-password"
                                value={formData.password}
                                onChange={handleChange}
                                required
                            />

                            <div className={styles['form-row']}>
                                <label className={styles['checkbox-label']}>
                                    <input 
                                        type="checkbox" 
                                        checked={rememberMe}
                                        onChange={() => setRememberMe(!rememberMe)}
                                    />
                                    <span className={`${styles['custom-check']} ${rememberMe ? styles.checked : ''}`} />
                                    <span>Ghi nhớ đăng nhập</span>
                                </label>

                                <Link to="/forgot-password" className={styles['forgot-link']}>
                                    Quên mật khẩu?
                                </Link>
                            </div>

                            <XButton 
                                type="submit" 
                                variant="primary" 
                                size="lg"
                                loading={loading}
                            >
                                Đăng nhập
                            </XButton>
                        </form>

                        {/* Switch to Sign Up */}
                        <div className={styles['switch-section']}>
                            <p className={styles['switch-prompt']}>Chưa có tài khoản?</p>
                            <XButton
                                type="button"
                                variant="outline"
                                size="md"
                                onClick={() => navigate('/signup')}
                            >
                                Đăng ký tài khoản
                            </XButton>
                        </div>
                    </Motion.div>
                </div>
            </div>

            {/* X-Style Footer */}
            <footer className={styles['x-footer']}>
                <nav className={styles['footer-nav']}>
                    <a href="#about" onClick={(e) => e.preventDefault()}>Giới thiệu</a>
                    <a href="#download" onClick={(e) => e.preventDefault()}>Tải ứng dụng</a>
                    <a href="#help" onClick={(e) => e.preventDefault()}>Trung tâm trợ giúp</a>
                    <a href="#terms" onClick={(e) => e.preventDefault()}>Điều khoản dịch vụ</a>
                    <a href="#privacy" onClick={(e) => e.preventDefault()}>Chính sách quyền riêng tư</a>
                    <a href="#cookies" onClick={(e) => e.preventDefault()}>Chính sách Cookie</a>
                    <a href="#accessibility" onClick={(e) => e.preventDefault()}>Khả năng truy cập</a>
                    <a href="#advertising" onClick={(e) => e.preventDefault()}>Thông tin quảng cáo</a>
                    <span>© 2026 Shrimple Corp.</span>
                </nav>
            </footer>
        </div>
    );
};

export default SignInPage;
