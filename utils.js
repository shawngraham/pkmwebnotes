// Simple storage utilities
const storage = {
    get: (key, defaultValue = {}) => {
        try {
            return JSON.parse(localStorage.getItem(key)) || defaultValue;
        } catch {
            return defaultValue;
        }
    },
    set: (key, value) => {
        localStorage.setItem(key, JSON.stringify(value));
    }
};

// Debounce utility
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};