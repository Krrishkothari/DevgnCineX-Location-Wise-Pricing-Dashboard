import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api', // Pointing to our Express backend
  timeout: 10000,
});

export const fetchPrices = async () => {
  try {
    const response = await api.get('/prices');
    return response.data;
  } catch (error) {
    console.error('Error fetching prices from backend:', error);
    return { data: [], total_entries: 0, last_updated: null };
  }
};
