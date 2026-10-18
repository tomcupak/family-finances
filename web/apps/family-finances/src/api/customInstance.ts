import type { AxiosRequestConfig } from 'axios'
import Axios from 'axios'

import { authToken } from '../utils/authToken'

const instance = Axios.create()

instance.interceptors.request.use((config) => {
	// Resolved per-request, not at import time - window.config isn't populated yet
	// when this module first loads (see index.html's inline placeholder).
	config.baseURL = window.config?.apiUrl ?? 'http://localhost:3000'
	const token = authToken.get()
	if (token) {
		config.headers.Authorization = `Bearer ${token}`
	}
	return config
})

instance.interceptors.response.use(undefined, (error) => {
	if (Axios.isAxiosError(error) && error.response?.status === 401) {
		window.dispatchEvent(new CustomEvent('family-finances:auth:unauthorized'))
	}
	return Promise.reject(error)
})

export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> =>
	instance(config).then((res) => res.data)
