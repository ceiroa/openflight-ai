const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || isLocalhost)) {
    window.addEventListener('load', async () => {
        try {
            await navigator.serviceWorker.register('/sw.js');
        } catch (error) {
            console.warn('Service worker registration failed.', error);
        }
    });
}
