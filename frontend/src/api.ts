import {refreshServerState} from './db';
import {hasAccessToken,loginRequest,logoutRequest} from './client';

export const login=loginRequest;
export const logout=logoutRequest;
export const isAuthenticated=hasAccessToken;
export const syncNow=()=>refreshServerState();
export const hydrate=syncNow;
