const developmentServerUrl = "http://localhost:5001";
const productionServerUrl = "https://shrimple.onrender.com";

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

export const API_URL = trimTrailingSlash(
    import.meta.env.VITE_API_URL
    || (import.meta.env.MODE === "development" ? developmentServerUrl : "/")
);

export const SOCKET_URL = trimTrailingSlash(
    import.meta.env.VITE_SOCKET_URL
    || (import.meta.env.MODE === "development" ? developmentServerUrl : productionServerUrl)
);

export const ASSET_BASE_URL = trimTrailingSlash(
    import.meta.env.VITE_ASSET_BASE_URL
    || (import.meta.env.MODE === "development" ? developmentServerUrl : productionServerUrl)
);

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
