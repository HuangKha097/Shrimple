import { useState, useEffect, useRef } from "react";
import { motion as Motion, AnimatePresence } from "motion/react";
import { Search, X, Loader2, ChevronDown } from "lucide-react";
import styles from "./XSearchSelect.module.scss";

/**
 * XSearchSelect - Debounced searchable select component for X style
 * Allows selecting from suggestions or keeping user's custom input.
 */
const XSearchSelect = ({
    label,
    placeholder = "Tìm kiếm...",
    value = "",
    onChange,
    fetchOptions, // (query: string) => Promise<string[] | { label, value, name, code }[]>
    debounceMs = 250,
    disabled = false,
    optional = false,
    className = "",
}) => {
    const [inputValue, setInputValue] = useState(value || "");
    const [options, setOptions] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef(null);
    const timerRef = useRef(null);

    // Sync input value when external value changes
    useEffect(() => {
        setInputValue(value || "");
    }, [value]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const performSearch = async (query) => {
        if (!fetchOptions || disabled) return;
        setLoading(true);
        try {
            const results = await fetchOptions(query);
            setOptions(results || []);
        } catch {
            setOptions([]);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const nextVal = e.target.value;
        setInputValue(nextVal);
        onChange?.(nextVal);
        setIsOpen(true);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            performSearch(nextVal);
        }, debounceMs);
    };

    const handleFocus = () => {
        if (disabled) return;
        setIsOpen(true);
        performSearch(inputValue);
    };

    const handleSelectOption = (opt) => {
        const selectedText = typeof opt === "string" ? opt : (opt.name || opt.label || opt.value);
        setInputValue(selectedText);
        onChange?.(selectedText, opt);
        setIsOpen(false);
    };

    const handleClear = (e) => {
        e.stopPropagation();
        setInputValue("");
        onChange?.("", null);
        setOptions([]);
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className={`${styles["search-select-wrapper"]} ${disabled ? styles.disabled : ""} ${className}`}>
            {label && (
                <label className={styles.label}>
                    <span>{label}</span>
                    {optional && <span className={styles.optional}>Tùy chọn</span>}
                </label>
            )}

            <div className={`${styles["input-box"]} ${isOpen ? styles.focused : ""}`}>
                <Search size={16} className={styles["search-icon"]} />
                <input
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={styles["raw-input"]}
                />

                {loading ? (
                    <Loader2 size={16} className={`animate-spin ${styles["status-icon"]}`} />
                ) : inputValue && !disabled ? (
                    <button
                        type="button"
                        onClick={handleClear}
                        className={styles["clear-btn"]}
                        aria-label="Xóa"
                    >
                        <X size={14} />
                    </button>
                ) : (
                    <ChevronDown size={16} className={styles["status-icon"]} />
                )}
            </div>

            <AnimatePresence>
                {isOpen && !disabled && (
                    <Motion.ul
                        className={styles.dropdown}
                        initial={{ opacity: 0, y: -4, scale: 0.99 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.99 }}
                        transition={{ duration: 0.12 }}
                    >
                        {loading && options.length === 0 ? (
                            <li className={styles["empty-item"]}>Đang tìm kiếm…</li>
                        ) : options.length === 0 ? (
                            <li className={styles["empty-item"]}>Không có gợi ý phù hợp</li>
                        ) : (
                            options.map((opt, idx) => {
                                const optText = typeof opt === "string" ? opt : (opt.name || opt.label);
                                const optKey = typeof opt === "string" ? `${opt}-${idx}` : (opt.code || opt.id || idx);
                                const isSelected = optText === inputValue;

                                return (
                                    <li
                                        key={optKey}
                                        onClick={() => handleSelectOption(opt)}
                                        className={`${styles["dropdown-item"]} ${isSelected ? styles.selected : ""}`}
                                    >
                                        {optText}
                                    </li>
                                );
                            })
                        )}
                    </Motion.ul>
                )}
            </AnimatePresence>
        </div>
    );
};

export default XSearchSelect;
