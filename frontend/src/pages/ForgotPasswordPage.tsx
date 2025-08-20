import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import RecaptchaComponent, { RecaptchaRef } from '@/components/ui/recaptcha';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  Code, 
  Loader2, 
  AlertCircle,
  ArrowLeft,
  Mail,
  CheckCircle
} from 'lucide-react';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const recaptchaRef = useRef<RecaptchaRef>(null);
  const { forgotPassword } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    if (!recaptchaToken) {
      toast({
        variant: 'destructive',
        title: 'reCAPTCHA Required',
        description: 'Please complete the reCAPTCHA verification.',
      });
      return;
    }

    setIsLoading(true);
    try {
      await forgotPassword(data.email, recaptchaToken);
      setEmailSent(true);
      toast({
        title: 'Reset email sent',
        description: 'Check your email for password reset instructions.',
      });
    } catch (error: any) {
      // Reset reCAPTCHA on error
      if (recaptchaRef.current) {
        recaptchaRef.current.reset();
        setRecaptchaToken(null);
      }
      toast({
        variant: 'destructive',
        title: 'Failed to send reset email',
        description: error.message || 'Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (emailSent) {
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
                  <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
                  <CardDescription>
                    We've sent password reset instructions to {getValues('email')}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-6">
                  <div className="text-center space-y-4">
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <Mail className="h-8 w-8 text-primary mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Click the link in the email to reset your password. The link will expire in 30 minutes.
                      </p>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Didn't receive the email? Check your spam folder or{' '}
                      <button 
                        onClick={() => setEmailSent(false)}
                        className="text-primary hover:text-primary/80 font-medium transition-colors"
                      >
                        try again
                      </button>
                    </p>
                  </div>

                  <div className="text-center">
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
                <CardTitle className="text-2xl font-bold">Forgot your password?</CardTitle>
                <CardDescription>
                  Enter your email address and we'll send you a link to reset your password
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email address"
                      {...register('email')}
                      className={errors.email ? 'border-destructive' : ''}
                    />
                    {errors.email && (
                      <p className="text-sm text-destructive">{errors.email.message}</p>
                    )}
                  </div>

                  {/* reCAPTCHA */}
                  <div className="flex justify-center">
                    <RecaptchaComponent
                      ref={recaptchaRef}
                      onVerify={(token) => setRecaptchaToken(token)}
                      onExpired={() => setRecaptchaToken(null)}
                      onError={() => setRecaptchaToken(null)}
                      theme="light"
                      size="normal"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={isLoading || !recaptchaToken}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending reset link...
                      </>
                    ) : (
                      'Send Reset Link'
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
                  <p className="text-xs text-muted-foreground">
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
              <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-start space-x-3">
                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <p className="font-medium mb-1">Security Notice</p>
                <p className="text-xs">
                  For your security, password reset links expire after 15 minutes. 
                  If you don't receive an email, please check your spam folder.
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