import { Router } from 'express';
import {
  login,
  register,
  sendOtp,
  verifyRegister,
  resetPassword,
  getMe,
  logout,
} from './auth.controller';
import { authGuard } from '../../middlewares/authGuard';
import { authLimiter, otpLimiter } from '../../middlewares/rateLimiter';

const router = Router();

router.post('/login', authLimiter, login);
router.post('/register', otpLimiter, register);
router.post('/send-otp', otpLimiter, sendOtp);
router.post('/verify-register', otpLimiter, verifyRegister);
router.post('/reset', otpLimiter, resetPassword);

router.get('/me', authGuard, getMe);
router.post('/logout', logout);

export default router;
