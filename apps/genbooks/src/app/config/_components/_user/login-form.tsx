'use client';

import React, { useCallback, useState } from 'react';
import { signIn } from 'next-auth/react';
import { Mail, Loader2 } from 'lucide-react';

// Google SVG icon as components
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);


interface LoginProps {
  logo?: React.ReactNode;
  title?: string;
  onLoginSuccess?: () => void;
  onLoginError?: (error: string) => void;
}

const Login: React.FC<LoginProps> = ({
  title = "🔓 Loggen Sie sich ein.",
  onLoginSuccess,
  onLoginError
}) => {
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');

  const getAbsoluteCallbackUrl = useCallback((): string => {
    if (typeof window === 'undefined') return '/dashboard';

    try {
      return new URL('/dashboard', window.location.origin).toString();
    } catch {
      return '/dashboard';
    }
  }, []);

  // Email validation function
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Handle email sign in
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setEmailError('');
    setEmailSent(false);

    if (!email) {
      setEmailError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setIsEmailLoading(true);

    try {
      const result = await signIn('nodemailer', {
        email,
        callbackUrl: getAbsoluteCallbackUrl(),
        redirect: false
      });

      if (result?.error || !result?.ok) {
        setError('Login failed. Please try again.');
        onLoginError?.(result?.error ?? 'Email sign-in failed');
      } else {
        setError('');
        onLoginSuccess?.();
        setEmailSent(true);
      }
    
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      onLoginError?.(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      
      setIsEmailLoading(false);
    }
  };

  // Handle OAuth sign in
  const handleOAuthSignIn = async (provider: 'google') => {
    setError('');
    
    if (provider === 'google') {
      setIsGoogleLoading(true);
    }

    try {
      const result = await signIn(provider, {
        callbackUrl: getAbsoluteCallbackUrl(),
        redirect: false
      });

      if (result?.error) {
        setError('Login failed. Please try again.');
        onLoginError?.(result.error);
      } else {
        setError('');
        onLoginSuccess?.();
        
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      onLoginError?.(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (provider === 'google') {
        setIsGoogleLoading(false);
      }
    }
  };

  return (
    <div className="bg-pirrot-blue-50 p-4 py-16 flex items-center justify-center">
      <div className="max-w-md w-full space-y-8">
          {/* Title */}
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-8">
              {title}
            </h2>
          </div>

          {/* Email Form */}
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1">
                  <label htmlFor="email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="beispiel@mail.org"
                    className="w-full px-3 py-2 border transition duration-200  rounded shadow-sm shadow-purple-500/10 border-info-50 bg-info-100/50 focus:outline-none focus:ring focus:ring-info-500/20 focus:border-info-100/80"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isEmailLoading}
                  className="flex items-center justify-center px-4 py-2 border  shadow-sm shadow-purple-500/10 text-sm font-medium rounded border-info-500/20 hover:border-info-500/50 bg-info-300/30 hover:bg-info-300/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isEmailLoading ? (
                    <>
                      <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Email
                    </>
                  )}
                </button>
              </div>
              {emailError && (
                <p className="mt-2 text-sm text-pirrot-red-400 font-medium">{emailError}</p>
              )}
              {emailSent && (
  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
    <p className="text-sm text-green-600">Check your email for the magic link!</p>
  </div>
)}
            </div>
          </form>

          {/* Divider */}
          <div className="mt-6 mb-6">
            <div className="relative">
              
              
              
              <div className="relative flex items-center justify-between text-sm">

                <i className='flex-1 h-[1px] rounded bg-info-500/10' />
                <span className="px-4">oder</span>
                <i className='flex-1 h-[1px] rounded bg-info-500/10' />
              </div>
            </div>
          </div>

          {/* Social Login Buttons */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => handleOAuthSignIn('google')}
                disabled={isGoogleLoading}
                className="flex-1 flex items-center justify-center px-4 py-2 border transition duration-200 rounded shadow-sm shadow-purple-500/10 border-info-50 bg-info-100/30 hover:bg-info-100/50 focus:outline-none focus:ring focus:ring-info-500/20 focus:border-info-100/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGoogleLoading ? (
                  <Loader2 className="animate-spin h-5 w-5 mr-2" />
                ) : (
                  <GoogleIcon />
                )}
                <span className="ml-2">Google</span>
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 bg-pirrot-red-50 border border-pirrot-red-200 rounded-md">
              <p className="text-sm text-pirrot-red-300">{error}</p>
            </div>
          )}
        </div>
      </div>
  );
};

export default Login;
