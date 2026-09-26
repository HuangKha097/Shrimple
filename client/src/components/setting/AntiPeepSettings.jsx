import React from 'react';
import classNames from 'classnames/bind';
import styles from '../../assets/css/AntiPeep.module.scss';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAntiPeep } from '../anti-peep/AntiPeepProvider';
import { RefreshCw, ScanFace, Shield } from 'lucide-react';
import { toast } from 'sonner';
import axios from '../../lib/axios';
import { FACE_MODEL_VERSION } from '../anti-peep/antiPeepVision';

const cx = classNames.bind(styles);

const AntiPeepSettings = () => {
    const { user, updateUser } = useAuthStore();
    const {
        cameraStatus,
        isProtecting,
        modelError,
        modelStatus,
        needsReenrollment,
        retryModelLoad,
        retryProtection,
        setupCalibration,
    } = useAntiPeep();

    const antiPeepData = user?.antiPeepData;
    const isCalibrated = Boolean(
        antiPeepData?.modelVersion === FACE_MODEL_VERSION
        && Array.isArray(antiPeepData?.faceDescriptors)
        && antiPeepData.faceDescriptors.length > 0
    );
    const isEnabled = antiPeepData?.isEnabled || false;
    const isLoading = modelStatus === 'loading';

    const toggleEnable = async () => {
        if (!isCalibrated && !isEnabled) {
            toast.error(
                needsReenrollment
                    ? 'Dữ liệu nhận diện cũ cần được cập nhật trước khi bật.'
                    : 'Vui lòng thiết lập Face ID trước khi bật bảo vệ.',
            );
            setupCalibration();
            return;
        }

        try {
            const newState = !isEnabled;
            await axios.put('/api/users/anti-peep', { isEnabled: newState });
            updateUser({
                antiPeepData: {
                    ...antiPeepData,
                    isEnabled: newState,
                },
            });
            toast.success(
                newState
                    ? 'Đã bật bảo vệ chống nhìn trộm'
                    : 'Đã tắt bảo vệ chống nhìn trộm',
            );
        } catch (error) {
            console.error(error);
            toast.error('Không thể cập nhật cài đặt');
        }
    };

    const protectionStatus = (() => {
        if (!isEnabled) return 'Đang tắt';
        if (cameraStatus === 'error') return 'Cần quyền camera';
        if (document.visibilityState === 'hidden') return 'Tạm dừng khi tab bị ẩn';
        if (isProtecting) return 'Đang bảo vệ';
        return 'Đang chuẩn bị';
    })();

    return (
        <div className={cx('anti-peep-container')}>
            <div className={cx('header-section')}>
                <div className={cx('header-title-row')}>
                    <div className={cx('header-icon')}>
                        <ScanFace size={22} />
                    </div>
                    <h2>Face ID & Chống nhìn trộm</h2>
                </div>
                <p className={cx('header-subtitle')}>
                    Quét tiết kiệm pin và chỉ phân tích ánh nhìn khi phát hiện người thứ hai.
                    Màn hình khóa khi cùng một người lạ nhìn liên tục 3 giây.
                </p>
            </div>

            <div className={cx('settings-group')}>
                <span className={cx('group-title')}>Tính năng bảo vệ · Cân bằng</span>
                <div className={cx('group-box')}>
                    <div className={cx('group-row')}>
                        <div className={cx('row-info')}>
                            <span className={cx('row-label')}>Tự động khóa màn hình</span>
                            <span className={cx('row-desc')}>
                                {protectionStatus}. Camera tự dừng khi tab bị ẩn.
                            </span>
                            {modelStatus === 'loading' && (
                                <span className={cx('row-desc')} aria-live="polite">
                                    Đang chuẩn bị AI...
                                </span>
                            )}
                            {modelStatus === 'error' && (
                                <span className={cx('row-desc')} role="alert">
                                    Không tải được AI: {modelError}
                                    {' '}
                                    <button type="button" onClick={retryModelLoad}>Thử lại</button>
                                </span>
                            )}
                            {cameraStatus === 'error' && (
                                <span className={cx('row-desc')} role="alert">
                                    Hãy cấp quyền camera để bảo vệ hoạt động.
                                    {' '}
                                    <button type="button" onClick={retryProtection}>Thử lại</button>
                                </span>
                            )}
                        </div>
                        <div className={cx('row-action')}>
                            <label className={cx('switch')}>
                                <input
                                    type="checkbox"
                                    checked={isEnabled}
                                    onChange={toggleEnable}
                                    disabled={isLoading}
                                    aria-label="Bật hoặc tắt bảo vệ chống nhìn trộm"
                                    aria-describedby="anti-peep-protection-description"
                                />
                                <span className={cx('slider')} />
                            </label>
                        </div>
                    </div>
                </div>
                <p id="anti-peep-protection-description" className={cx('group-footer')}>
                    Detector chạy ở nhịp thấp; gaze và nhận diện chỉ bật khi có từ hai khuôn mặt.
                </p>
            </div>

            <div className={cx('settings-group')}>
                <span className={cx('group-title')}>Dữ liệu sinh trắc học</span>
                <div className={cx('group-box')}>
                    <div className={cx('group-row')}>
                        <div className={cx('row-info')}>
                            <span className={cx('row-label')}>Khuôn mặt Face ID</span>
                            <span className={cx('row-desc')}>
                                {needsReenrollment
                                    ? 'Dữ liệu nhận diện cũ cần cập nhật để phát hiện chính xác hơn.'
                                    : isCalibrated
                                        ? 'Đã lưu ' + antiPeepData.faceDescriptors.length + ' mẫu đặc trưng khuôn mặt.'
                                        : 'Chưa có dữ liệu khuôn mặt. Thiết lập để bắt đầu sử dụng.'}
                            </span>
                        </div>
                        <div className={cx('row-action')}>
                            <button
                                type="button"
                                className={cx('minimal-action-btn')}
                                onClick={setupCalibration}
                                disabled={isLoading}
                            >
                                {isCalibrated || needsReenrollment ? (
                                    <>
                                        <RefreshCw size={14} />
                                        <span>
                                            {needsReenrollment ? 'Cập nhật nhận diện' : 'Căn chỉnh lại'}
                                        </span>
                                    </>
                                ) : (
                                    <span>Thiết lập Face ID</span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className={cx('privacy-note')}>
                <Shield size={18} className={cx('note-icon')} />
                <p>
                    <strong>Quyền riêng tư:</strong> Ảnh và video camera được xử lý trực tiếp
                    trong trình duyệt và không được lưu. Máy chủ chỉ lưu các vector đặc trưng
                    khuôn mặt cần thiết để đồng bộ và so khớp.
                </p>
            </div>
        </div>
    );
};

export default AntiPeepSettings;
