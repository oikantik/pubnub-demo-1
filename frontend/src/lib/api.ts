import axios from "axios";

// API configuration
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:9292";

// Create Axios instance with default config
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor to add auth token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("authToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// API endpoints class
export class API {
  // Authentication
  static login = (username: string) => {
    return apiClient.post("/v1/users/login", { name: username });
  };

  static logout = () => {
    return apiClient.delete("/v1/users/logout");
  };

  // User
  static getUserInfo = () => {
    return apiClient.get("/v1/users/me");
  };

  static getUserChannels = () => {
    return apiClient.get("/v1/users/channels");
  };

  // Channels
  static getAllChannels = () => {
    return apiClient.get("/v1/channels");
  };

  static createChannel = (name: string) => {
    return apiClient.post("/v1/channels", { name });
  };

  static joinChannel = (channelId: string) => {
    return apiClient.post(`/v1/channels/${channelId}/join`);
  };

  static getChannelMessages = (channelId: string) => {
    return apiClient.get(`/v1/channels/${channelId}/messages`);
  };

  static getChannelPresence = (channelId: string) => {
    return apiClient.get(`/v1/channels/${channelId}/presence`);
  };

  // Messages
  static sendMessage = (channelId: string, message: string) => {
    return apiClient.post(`/v1/channels/${channelId}/messages`, { message });
  };

  // PubNub tokens
  static getPubnubToken = () => {
    return apiClient.post("/v1/tokens/pubnub");
  };
}

export default apiClient;
