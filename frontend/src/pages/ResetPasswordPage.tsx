import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiService } from '@/services/api';
import { 
  Code, 
  Eye, 
  EyeOff, 
  Loader2, 
  AlertCircle,
  ArrowLeft,
  CheckCircle
} from 'lucide-react';

const resetPasswordSchema = z.object({
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain uppercase, lowercase, number, and special character'),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [tokenValidating, setTokenValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [userInfo, setUserInfo] = useState<{ email: string; username: string } | null>(null);
  const [searchParams] = useSearchParams();
  const { resetPassword } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const token = searchParams.get('token');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const password = watch('newPassword');

  // Validate the reset token on component mount
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setTokenValidating(false);
        setTokenValid(false);
        return;
      }

      try {
        const response = await apiService.validateResetToken(token);
        setUserInfo(response.data.data);
        setTokenValid(true);
      } catch (error: any) {
        console.error('Token validation failed:', error);
        setTokenValid(false);
        toast({
          variant: 'destructive',
          title: 'Invalid Reset Link',
          description: 'This password reset link is invalid or has expired.',
        });
      } finally {
        setTokenValidating(false);
      }
    };

    validateToken();
  }, [token, toast]);

  const getPasswordStrength = (password: string) => {
    if (!password) return { score: 0, feedback: [] };
    
    const feedback = [];
    let score = 0;

    if (password.length >= 8) score++;
    else feedback.push('At least 8 characters');

    if (/[a-z]/.test(password)) score++;
    else feedback.push('Lowercase letter');

    if (/[A-Z]/.test(password)) score++;
    else feedback.push('Uppercase letter');

    if (/\d/.test(password)) score++;
    else feedback.push('Number');

    if (/[@$!%*?&]/.test(password)) score++;
    else feedback.push('Special character');

    return { score, feedback };
  };

  const passwordStrength = getPasswordStrength(password || '');

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!token) return;
    
    setIsLoading(true);
    try {
      await resetPassword(token, data.newPassword, data.confirmPassword);
      setResetSuccess(true);
      toast({
        title: 'Password reset successful',
        description: 'Your password has been updated. You can now sign in.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Password reset failed',
        description: error.message || 'An error occurred while resetting your password.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while validating token
  if (tokenValidating) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="octra-header">
          <div className="app-container py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <Code className="h-4 w-4 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold">XME Projects</h1>
            </Link>
            <ThemeToggle />
          </div>
        </header>

        {/* Main Content */}
        <main className="app-container py-12">
          <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
            <div className="w-full max-w-md">
              <Card className="octra-card">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin mb-4" />
                  <p className="text-muted-foreground">Validating reset link...</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Show error state for invalid token
  if (!tokenValid || !token) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="octra-header">
          <div className="app-container py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <Code className="h-4 w-4 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold">XME Projects</h1>
            </Link>
            <ThemeToggle />
          </div>
        </header>

        {/* Main Content */}
        <main className="app-container py-12">
          <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
            <div className="w-full max-w-md">
              <Card className="octra-card">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 h-12 w-12 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                    <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                  <CardTitle className="text-2xl font-bold">Invalid Reset Link</CardTitle>
                  <CardDescription>
                    This password reset link is invalid or has expired
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-6">
                  <Alert>
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <AlertDescription>
                        The password reset link you clicked is either invalid or has expired. 
                        Please request a new password reset to continue.
                      </AlertDescription>
                    </div>
                  </Alert>

                  <div className="space-y-3">
                    <Link to="/forgot-password">
                      <Button className="w-full mb-2">
                        Request New Reset Link
                      </Button>
                    </Link>
                    
                    <Link to="/login">
                      <Button variant="outline" className="w-full">
                        Back to Sign In
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Show success state
  if (resetSuccess) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="octra-header">
          <div className="app-container py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <Code className="h-4 w-4 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold">XME Projects</h1>
            </Link>
            <ThemeToggle />
          </div>
        </header>

        {/* Main Content */}
        <main className="app-container py-12">
          <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
            <div className="w-full max-w-md">
              <Card className="octra-card">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 h-12 w-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <CardTitle className="text-2xl font-bold">Password reset successful</CardTitle>
                  <CardDescription>
                    Your password has been updated successfully
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-6">
                  <div className="text-center space-y-4 mb-2">
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="text-sm text-green-800 dark:text-green-300">
                        You can now sign in to your account using your new password.
                      </p>
                    </div>
                  </div>

                  <Link to="/login">
                    <Button className="w-full">
                      Sign In to Your Account
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Show reset password form
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="octra-header">
        <div className="app-container py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <ArrowLeft className="h-4 w-4" />
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <Code className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold">XME Projects</h1>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="app-container py-12">
        <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
          <div className="w-full max-w-md">
            <Card className="octra-card">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold">Reset your password</CardTitle>
                <CardDescription>
                  {userInfo && (
                    <>Create a new password for <strong>{userInfo.username}</strong> ({userInfo.email})</>
                  )}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Create a new password"
                        {...register('newPassword')}
                        className={errors.newPassword ? 'border-destructive pr-10' : 'pr-10'}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    
                    {/* Password Strength Indicator */}
                    {password && (
                      <div className="space-y-2">
                        <div className="flex space-x-1">
                          {[...Array(5)].map((_, i) => (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded ${ 
                                i < passwordStrength.score
                                  ? passwordStrength.score <= 2
                                    ? 'bg-destructive'
                                    : passwordStrength.score <= 3
                                    ? 'bg-yellow-500'
                                    : 'bg-green-500'
                                  : 'bg-muted'
                              }`}
                            />
                          ))}
                        </div>
                        {passwordStrength.feedback.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            Missing: {passwordStrength.feedback.join(', ')}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {errors.newPassword && (
                      <p className="text-sm text-destructive">{errors.newPassword.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirm your new password"
                        {...register('confirmPassword')}
                        className={errors.confirmPassword ? 'border-destructive pr-10' : 'pr-10'}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                    )}
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resetting password...
                      </>
                    ) : (
                      'Reset Password'
                    )}
                  </Button>
                </form>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      Or
                    </span>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Remember your password?{' '}
                    <Link 
                      to="/login" 
                      className="text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                      Sign in
                    </Link>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Additional Info */}
            <div className="mt-8 text-center">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-start space-x-3">
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <p className="font-medium mb-1">Secure Reset</p>
                    <p className="text-xs">
                      This password reset link is valid for 15 minutes and can only be used once. 
                      Your new password will be securely encrypted.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}