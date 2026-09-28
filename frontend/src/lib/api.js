import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const startAnalysis = (url) => axios.post(`${API}/repos/analyze`, { url }).then((r) => r.data);
export const getStatus = (jobId, timeout) => axios.get(`${API}/repos/${jobId}/status`, { timeout }).then((r) => r.data);
export const getResult = (jobId, timeout) => axios.get(`${API}/repos/${jobId}`, { timeout }).then((r) => r.data);
export const getPreview = (jobId, path) =>
  axios.get(`${API}/repos/${jobId}/file`, { params: { path } }).then((r) => r.data);

export const isTransientError = (error) =>
  !error?.response || error.response.status === 429 || error.response.status >= 500;
