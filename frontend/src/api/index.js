import axios from 'axios';

// Note: every function here used to catch its own errors and return an empty
// payload, which made "the backend is down" indistinguishable from "there is no
// data" — the dashboard cheerfully rendered an empty state either way. Errors
// now propagate so React Query can surface them.

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 20000,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const detail = error.response?.data?.error;
    if (error.code === 'ECONNABORTED') {
      error.friendlyMessage = 'The server took too long to respond.';
    } else if (!error.response) {
      error.friendlyMessage = 'Cannot reach the server. Is the backend running?';
    } else if (status === 429) {
      const wait = error.response.data?.retry_after_seconds;
      error.friendlyMessage = wait
        ? `Too many requests — try again in ${wait}s.`
        : 'Too many requests.';
    } else if (status === 409) {
      error.friendlyMessage = detail || 'A scrape is already running.';
    } else {
      error.friendlyMessage = detail || `Request failed (${status}).`;
    }
    return Promise.reject(error);
  }
);

const get = async (url, params) => (await api.get(url, { params })).data;

export const fetchPrices = (date, owned = false, location) =>
  get('/prices', {
    ...(date ? { date } : {}),
    ...(owned ? { owned: 'true' } : {}),
    ...(location ? { location } : {}),
  });

export const fetchMovies = (date, location) =>
  get('/movies', { ...(date ? { date } : {}), ...(location ? { location } : {}) });

export const fetchDates = () => get('/dates');

export const fetchConfig = () => get('/config');

export const fetchProgress = () => get('/progress');

export const fetchHealth = () => get('/health');

export const fetchHistory = (cinema, location, movie, seat_category, date, showtime) =>
  get('/history', { cinema, location, movie, seat_category, date, showtime });

export const triggerScrape = async () => (await api.post('/scrape/trigger')).data;
