import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api', // Pointing to our Express backend
  timeout: 10000,
});

export const fetchPrices = async (date) => {
  try {
    const params = {};
    if (date) params.date = date;
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

export const fetchMovies = async (date) => {
  try {
    const params = {};
    if (date) params.date = date;
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
