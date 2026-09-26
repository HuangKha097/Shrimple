import React, { useState } from 'react';
import classNames from 'classnames/bind';
import { motion as Motion, AnimatePresence } from 'motion/react';
import styles from '../../assets/css/CreatePollModal.module.scss';
import { BarChart2, X, Plus, Trash2 } from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import { toast } from 'sonner';

const cx = classNames.bind(styles);

const CreatePollModal = ({ conversationId, onClose }) => {
    const { createPollAction } = useChatStore();
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState(['', '']);
    const [allowMultiple, setAllowMultiple] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleOptionChange = (index, value) => {
        const next = [...options];
        next[index] = value;
        setOptions(next);
    };

    const handleAddOption = () => {
        if (options.length >= 10) {
            toast.error("Tối đa 10 phương án");
            return;
        }
        setOptions([...options, '']);
    };

    const handleRemoveOption = (index) => {
        if (options.length <= 2) {
            toast.error("Cuộc bình chọn cần tối thiểu 2 phương án");
            return;
        }
        const next = options.filter((_, i) => i !== index);
        setOptions(next);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmedQuestion = question.trim();
        if (!trimmedQuestion) {
            toast.error("Vui lòng nhập câu hỏi");
            return;
        }

        const validOptions = options.map(o => o.trim()).filter(Boolean);
        if (validOptions.length < 2) {
            toast.error("Vui lòng nhập ít nhất 2 phương án");
            return;
        }

        try {
            setIsSubmitting(true);
            await createPollAction(conversationId, trimmedQuestion, validOptions, allowMultiple);
            toast.success("Đã tạo cuộc bình chọn!");
            onClose();
        } catch (error) {
            console.error("Failed to create poll:", error);
            toast.error(error.response?.data?.message || "Không thể tạo cuộc bình chọn");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            <div className={cx('overlay')} onClick={onClose}>
                <Motion.div 
                    className={cx('modal')}
                    initial={{ opacity: 0, scale: 0.94, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: 12 }}
                    transition={{ type: "spring", stiffness: 450, damping: 30 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={cx('header')}>
                        <div className={cx('title-group')}>
                            <div className={cx('icon-box')}>
                                <BarChart2 size={18} />
                            </div>
                            <h3 className={cx('title')}>Tạo cuộc bình chọn</h3>
                        </div>
                        <button className={cx('close-btn')} onClick={onClose}>
                            <X size={18} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className={cx('body')}>
                            <div className={cx('form-group')}>
                                <label className={cx('label')}>Câu hỏi bình chọn</label>
                                <input
                                    type="text"
                                    className={cx('input')}
                                    placeholder="Đặt câu hỏi bình chọn..."
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    maxLength={250}
                                    autoFocus
                                />
                            </div>

                            <div className={cx('form-group')}>
                                <label className={cx('label')}>Các phương án lựa chọn</label>
                                <div className={cx('options-list')}>
                                    {options.map((opt, idx) => (
                                        <div key={idx} className={cx('option-row')}>
                                            <input
                                                type="text"
                                                className={cx('option-input')}
                                                placeholder={`Phương án ${idx + 1}`}
                                                value={opt}
                                                onChange={(e) => handleOptionChange(idx, e.target.value)}
                                                maxLength={150}
                                            />
                                            {options.length > 2 && (
                                                <button
                                                    type="button"
                                                    className={cx('remove-btn')}
                                                    onClick={() => handleRemoveOption(idx)}
                                                    title="Xóa phương án"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ))}

                                    {options.length < 10 && (
                                        <button
                                            type="button"
                                            className={cx('add-option-btn')}
                                            onClick={handleAddOption}
                                        >
                                            <Plus size={16} />
                                            <span>Thêm phương án</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div 
                                className={cx('toggle-group')}
                                onClick={() => setAllowMultiple(!allowMultiple)}
                            >
                                <div className={cx('toggle-info')}>
                                    <span className={cx('toggle-title')}>Nhiều lựa chọn</span>
                                    <span className={cx('toggle-desc')}>Cho phép mọi người chọn nhiều hơn một phương án</span>
                                </div>
                                <input
                                    type="checkbox"
                                    className={cx('checkbox')}
                                    checked={allowMultiple}
                                    onChange={(e) => setAllowMultiple(e.target.checked)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </div>

                        <div className={cx('footer')}>
                            <button
                                type="button"
                                className={cx('btn-cancel')}
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Hủy
                            </button>
                            <button
                                type="submit"
                                className={cx('btn-submit')}
                                disabled={isSubmitting || !question.trim()}
                            >
                                {isSubmitting ? "Đang tạo..." : "Tạo bình chọn"}
                            </button>
                        </div>
                    </form>
                </Motion.div>
            </div>
        </AnimatePresence>
    );
};

export default CreatePollModal;
