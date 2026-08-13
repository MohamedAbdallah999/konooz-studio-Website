import {clearCachedState,refreshServerState} from './db';
import {hasAccessToken,loginRequest,logoutRequest,restoreSession} from './client';

export const login=loginRequest;
export const logout=async()=>{try{await logoutRequest()}finally{await clearCachedState()}};
export const clearSessionCache=clearCachedState;
export const isAuthenticated=hasAccessToken;
export const validateSession=restoreSession;
export const syncNow=()=>refreshServerState();
export const hydrate=syncNow;
