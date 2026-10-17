import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { toast } from 'sonner';
import { motion as Motion } from 'motion/react';
import styles from '../assets/css/SignUpPage.module.scss';
import { useAuthStore } from '../stores/useAuthStore';
import GoogleOtpDialog from '../components/auth/GoogleOtpDialog';
import SignupOtpDialog from '../components/auth/SignupOtpDialog';
import SideRays from '../components/ui/animate/SideRays';
import XInput from '../components/ui/animate/XInput';
import XButton from '../components/ui/animate/XButton';

const SignUpPage = () => {
    const navigate = useNavigate();
    const { signUp, googleLogin, loading } = useAuthStore();
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [errors, setErrors] = useState({});
    const [googleVerification, setGoogleVerification] = useState(null);
    const [emailVerification, setEmailVerification] = useState(null);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        // Clear field error on change
        if (errors[name]) {
            setErrors((prev) => ({ ...prev, [name]: '' }));
        }
    };

    const validateForm = () => {
        const newErrors = {};
        if (!formData.fullName.trim()) {
            newErrors.fullName = 'Vui lòng nhập họ và tên';
        }
        if (!formData.email.trim()) {
            newErrors.email = 'Vui lòng nhập địa chỉ email';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Định dạng email không hợp lệ';
        }
        if (!formData.password) {
            newErrors.password = 'Vui lòng nhập mật khẩu';
        } else if (formData.password.length < 6) {
            newErrors.password = 'Mật khẩu phải có ít nhất 6 ký tự';
        }
        if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            const firstError = Object.values(newErrors)[0];
            toast.error(firstError);
            return false;
        }
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const isValid = validateForm();
        if (!isValid) return;

        try {
            const result = await signUp({
                fullName: formData.fullName,
                email: formData.email,
                password: formData.password
            });
            if (result.success) {
                if (result.requiresOtp) {
                    setEmailVerification({ pendingToken: result.pendingToken, email: result.email });
                    return;
                }
                toast.success('Tạo tài khoản thành công!');
                navigate('/complete-profile');
            }
        } catch {
            // Handled in store
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
            toast.error('Đăng ký Google thất bại');
        }
    };

    return (
        <div className={styles['page-wrapper']}>
            <SignupOtpDialog
                open={Boolean(emailVerification)}
                email={emailVerification?.email || ''}
                pendingToken={emailVerification?.pendingToken || ''}
                onCancel={() => setEmailVerification(null)}
                onVerified={() => {
                    setEmailVerification(null);
                    navigate('/complete-profile');
                }}
            />

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
                        <h1 className={styles['hero-heading']}>Tham gia Shrimple ngay hôm nay</h1>

                        {/* Social Login */}
                        <div className={styles['social-wrapper']}>
                            <div className={styles['google-btn-container']}>
                                <GoogleLogin
                                    onSuccess={handleGoogleSuccess}
                                    onError={() => toast.error('Google Signup Failed')}
                                    theme="filled_black"
                                    shape="pill"
                                    text="signup_with"
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

                        {/* Registration Form */}
                        <form onSubmit={handleSubmit} className={styles['auth-form']}>
                            <XInput
                                id="signup-full-name"
                                name="fullName"
                                type="text"
                                label="Họ và tên"
                                autoComplete="name"
                                value={formData.fullName}
                                onChange={handleChange}
                                error={errors.fullName}
                                required
                            />

                            <XInput
                                id="signup-email"
                                name="email"
                                type="email"
                                label="Địa chỉ email"
                                autoComplete="email"
                                value={formData.email}
                                onChange={handleChange}
                                error={errors.email}
                                required
                            />

                            <XInput
                                id="signup-password"
                                name="password"
                                type="password"
                                label="Mật khẩu (tối thiểu 6 ký tự)"
                                autoComplete="new-password"
                                value={formData.password}
                                onChange={handleChange}
                                error={errors.password}
                                required
                            />

                            <XInput
                                id="signup-confirm-password"
                                name="confirmPassword"
                                type="password"
                                label="Xác nhận mật khẩu"
                                autoComplete="new-password"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                error={errors.confirmPassword}
                                required
                            />

                            <p className={styles['terms-text']}>
                                Bằng cách đăng ký, bạn đồng ý với{' '}
                                <a href="#terms" onClick={(e) => e.preventDefault()}>Điều khoản dịch vụ</a>
                                {' '}và{' '}
                                <a href="#privacy" onClick={(e) => e.preventDefault()}>Chính sách quyền riêng tư</a>
                                , bao gồm Sử dụng Cookie.
                            </p>

                            <XButton 
                                type="submit" 
                                variant="primary" 
                                size="lg"
                                loading={loading}
                            >
                                Tạo tài khoản
                            </XButton>
                        </form>

                        {/* Switch to Sign In */}
                        <div className={styles['switch-section']}>
                            <p className={styles['switch-prompt']}>Đã có tài khoản?</p>
                            <XButton
                                type="button"
                                variant="outline"
                                size="md"
                                onClick={() => navigate('/signin')}
                            >
                                Đăng nhập
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

export default SignUpPage;
