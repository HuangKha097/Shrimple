import { Newspaper, MessageSquare, Video, Users, User, Settings } from 'lucide-react';

export const getNavigationItems = (userId) => [
    { id: 'feed', path: '/feed', icon: Newspaper, labelKey: 'nav.feed' },
    { id: 'chat', path: '/chat', icon: MessageSquare, labelKey: 'nav.chat' },
    { id: 'video', path: '/video', icon: Video, labelKey: 'nav.video' },
    { id: 'friends', path: '/feed/friends', icon: Users, labelKey: 'nav.friends' },
    { id: 'profile', path: userId ? `/feed/profile/${userId}` : '/feed', icon: User, labelKey: 'nav.profile' },
    { id: 'settings', path: '/setting', icon: Settings, labelKey: 'nav.settings' },
];

export const isNavigationActive = (item, pathname) => {
    if (item.id === 'feed') return pathname === '/feed';
    if (item.id === 'settings') return pathname === '/setting' || pathname === '/settings';
    if (item.id === 'profile' && pathname === item.path.replace('/feed/profile/', '/profile/')) return true;
    return pathname === item.path || pathname.startsWith(`${item.path}/`);
};

export const hasUnreadMessages = (conversations, userId) => (conversations || []).some(conversation => {
    const counts = conversation?.unreadCounts;
    const count = counts instanceof Map ? counts.get(userId)
        : typeof counts === 'object' && counts ? counts[userId] : counts;
    return Number(count) > 0;
});

export const openPostComposer = (navigate) => {
    navigate('/feed');
    window.setTimeout(() => {
        const input = document.querySelector('textarea[data-composer-input]');
        input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        input?.focus({ preventScroll: true });
    }, 100);
};
