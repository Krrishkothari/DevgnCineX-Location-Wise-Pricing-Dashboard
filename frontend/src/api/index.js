import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api', 
  timeout: 10000,
});

export const fetchPrices = async (date, owned = false) => {
  try {
    const params = {};
    if (date) params.date = date;
    if (owned) params.owned = 'true';
    const response = await api.get('/prices', { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching prices from backend:', error);
    return { data: [], total_entries: 0, last_updated: null };
  }
};

export const triggerScrape = async () => {
  try {
    const response = await api.post('/scrape/trigger');
    return response.data;
  } catch (error) {
    console.error('Error triggering scrape:', error);
    throw error;
  }
};

export const fetchMovies = async (date, location) => {
  try {
    const params = {};
    if (date) params.date = date;
    if (location) params.location = location;
    const response = await api.get('/movies', { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching movies:', error);
    return { movies: [] };
  }
};

export const fetchDates = async () => {
  try {
    const response = await api.get('/dates');
    return response.data;
  } catch (error) {
    console.error('Error fetching dates:', error);
    return { dates: [] };
  }
};

export const fetchHistory = async (cinema, location, movie, seat_category, date, showtime) => {
  try {
    const response = await api.get('/history', {
      params: { cinema, location, movie, seat_category, date, showtime }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching history:', error);
    return { history: [] };
  }
};
