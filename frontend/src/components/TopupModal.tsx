// React core
import React, { useState, useEffect } from 'react';

// UI Components - Form controls
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// UI Components - Layout and display
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// UI Components - Dialogs
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Hooks and services
import { useToast } from '@/hooks/use-toast';
import {
  apiService,
  TopupCalculationResponse,
  TopupResponse,
  PaymentMethod
} from '@/services/api';

// Icons
import {
  Calculator,
  CreditCard,
  Percent,
  Loader2,
  CheckCircle,
  AlertCircle,
  Coins,
  ArrowRight,
  QrCode,
  X
} from 'lucide-react';

interface TopupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function TopupModal({ open, onOpenChange, onSuccess }: TopupModalProps) {
  const [step, setStep] = useState<'input' | 'confirm' | 'payment'>('input');
  const [quantity, setQuantity] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [calculation, setCalculation] = useState<TopupCalculationResponse | null>(null);
  const [paymentData, setPaymentData] = useState<TopupResponse | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoadingMethods, setIsLoadingMethods] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);

  const { toast } = useToast();

  // Check payment status periodically when QR modal is open
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    if (showQrModal && paymentData?.reference) {
      setIsCheckingPayment(true);
      
      const checkPaymentStatus = async () => {
        try {
          const response = await apiService.getTopupHistory();
          
          if (response.data.success && response.data.data) {
            const currentTransaction = response.data.data.find(
              (transaction: any) => transaction.reference === paymentData.reference
            );
            
            if (currentTransaction && currentTransaction.status === 'PAID') {
              // Payment successful - close modal and show success message
              setShowQrModal(false);
              onOpenChange(false);
              setIsCheckingPayment(false);
              
              toast({
                title: 'Payment Successful!',
                description: `Your quota has been updated successfully. Added ${paymentData.quantity} quota to your account.`,
                variant: 'default',
              });
              
              if (onSuccess) onSuccess();
              
              // Clear the interval
              if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
              }
            }
          }
        } catch (error) {
          console.error('Error checking payment status:', error);
        }
      };

      // Check immediately and then every 5 seconds
      checkPaymentStatus();
      pollInterval = setInterval(checkPaymentStatus, 5000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      setIsCheckingPayment(false);
    };
  }, [showQrModal, paymentData?.reference, onOpenChange, onSuccess, toast]);

  // Load payment methods from API
  const loadPaymentMethods = async () => {
    try {
      setIsLoadingMethods(true);
      const response = await apiService.getEnabledPaymentMethods();
      
      if (response.data.success && response.data.data) {
        setPaymentMethods(response.data.data);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.message || 'Failed to load payment methods',
      });
    } finally {
      setIsLoadingMethods(false);
    }
  };

  useEffect(() => {
    if (open) {
      // Reset form when modal opens
      setStep('input');
      setQuantity('');
      setPaymentMethod('');
      setCalculation(null);
      setPaymentData(null);
      
      // Load payment methods
      loadPaymentMethods();
    }
  }, [open]);

  // Real-time calculation when quantity changes
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (quantity && parseInt(quantity) > 0) {
        calculatePrice();
      } else {
        setCalculation(null);
      }
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [quantity]);

  const calculatePrice = async () => {
    try {
      setIsCalculating(true);
      const response = await apiService.calculateTopup({ quantity: parseInt(quantity) });
      
      if (response.data.success && response.data.data) {
        setCalculation(response.data.data);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Calculation Error',
        description: error.response?.data?.message || 'Failed to calculate price',
      });
    } finally {
      setIsCalculating(false);
    }
  };

  const handleProceed = () => {
    if (!calculation || !paymentMethod) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please enter quantity and select payment method',
      });
      return;
    }
    setStep('confirm');
  };

  const handleConfirmPayment = async () => {
    if (!calculation || !paymentMethod) return;

    try {
      setIsProcessing(true);
      const response = await apiService.createTopup({
        quantity: calculation.quantity,
        payment_method: paymentMethod,
      });

      if (response.data.success && response.data.data) {
        setPaymentData(response.data.data);

        // Show QR modal if QR URL exists
        if (response.data.data.qr_url) {
          setShowQrModal(true);
        } else {
          setStep('payment');
          setShowPaymentDialog(true);
        }
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Payment Error',
        description: error.response?.data?.message || 'Failed to create payment',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentRedirect = () => {
    if (paymentData?.checkout_url) {
      window.open(paymentData.checkout_url, '_blank');
      setShowPaymentDialog(false);
      onOpenChange(false);
      if (onSuccess) onSuccess();
      
      toast({
        title: 'Payment Initiated',
        description: 'Complete your payment in the new window. Your quota will be added automatically upon successful payment.',
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getDiscountInfo = (percentage: number) => {
    if (percentage === 0) return null;
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
        <Percent className="w-3 h-3 mr-1" />
        {percentage}% OFF
      </Badge>
    );
  };

  return (
    <>
      <Dialog open={open && !showQrModal} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Topup Quota
            </DialogTitle>
            <DialogDescription>
              Refill your quota to continue using our Windows installation service
            </DialogDescription>
          </DialogHeader>

          {step === 'input' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Each quota allows one Windows installation
                </p>
              </div>

              {calculation && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>Price Calculation</span>
                      {getDiscountInfo(calculation.discount_percentage)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{calculation.quantity}x {calculation.product.name}</span>
                      <span>{formatCurrency(calculation.total_amount)}</span>
                    </div>
                    
                    {calculation.discount_amount > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Discount ({calculation.discount_percentage}%)</span>
                        <span>-{formatCurrency(calculation.discount_amount)}</span>
                      </div>
                    )}
                    
                    <Separator />
                    
                    <div className="flex justify-between font-semibold">
                      <span>Final Amount</span>
                      <span>{formatCurrency(calculation.final_amount)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                <Label htmlFor="payment-method">Payment Method *</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod} disabled={isLoadingMethods}>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingMethods ? "Loading payment methods..." : "Select payment method"} />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method.code} value={method.code}>
                        {method.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Discount Information</h4>
                <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <div>• 5 quota: 12% discount</div>
                  <div>• 6-10 quota: 20% discount</div>
                  <div>• 11-19 quota: 25% discount</div>
                  <div>• 20+ quota: 30% discount</div>
                </div>
              </div>

              <Button
                onClick={handleProceed}
                disabled={!calculation || !paymentMethod || isCalculating}
                className="w-full"
              >
                {isCalculating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                Proceed to Payment
              </Button>
            </div>
          )}

          {step === 'confirm' && calculation && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span>Product</span>
                    <span>{calculation.product.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Quantity</span>
                    <span>{calculation.quantity} quota</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Payment Method</span>
                    <span>{paymentMethods.find(m => m.code === paymentMethod)?.name}</span>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatCurrency(calculation.total_amount)}</span>
                  </div>
                  
                  {calculation.discount_amount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount</span>
                      <span>-{formatCurrency(calculation.discount_amount)}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between font-semibold text-lg">
                    <span>Total</span>
                    <span>{formatCurrency(calculation.final_amount)}</span>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep('input')}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleConfirmPayment}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="mr-2 h-4 w-4" />
                  )}
                  Confirm Payment
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Payment Created Successfully
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>Your payment has been created successfully. Click continue to complete the payment process.</p>
                
                {paymentData && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Reference:</span>
                          <span className="font-mono">{paymentData.reference}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Amount:</span>
                          <span className="font-semibold">{formatCurrency(paymentData.final_amount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Payment:</span>
                          <span>{paymentData.payment_name}</span>
                        </div>
                        {paymentData.pay_code && (
                          <div className="flex justify-between">
                            <span>Pay Code:</span>
                            <span className="font-mono">{paymentData.pay_code}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction onClick={handlePaymentRedirect}>
              <CreditCard className="mr-2 h-4 w-4" />
              Continue to Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QR Code Modal */}
      <Dialog open={showQrModal} onOpenChange={(isOpen) => {
        if (!isOpen) {
          setShowQrModal(false);
          onOpenChange(false);
          if (onSuccess) onSuccess();
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Scan QR Code to Pay
              {isCheckingPayment && (
                <Loader2 className="h-4 w-4 animate-spin ml-2 text-blue-500" />
              )}
            </DialogTitle>
            <DialogDescription>
              {isCheckingPayment 
                ? "Scan the QR code below with your payment app. We'll automatically detect when payment is completed."
                : "Scan the QR code below with your payment app to complete the transaction."
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {paymentData?.qr_url && (
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-lg border">
                  <img
                    src={paymentData.qr_url}
                    alt="Payment QR Code"
                    className="w-64 h-64 object-contain"
                  />
                </div>
              </div>
            )}

            {paymentData && (
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Reference:</span>
                      <span className="font-mono text-xs">{paymentData.reference}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Amount:</span>
                      <span className="font-semibold">{formatCurrency(paymentData.final_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Payment:</span>
                      <span>{paymentData.payment_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <Badge variant="secondary">{paymentData.status}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Expires:</span>
                      <span className="text-red-600 font-medium">
                        {new Date(paymentData.expired_time * 1000).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setShowQrModal(false);
                  onOpenChange(false);
                  if (onSuccess) onSuccess();
                }}
                className="flex-1"
              >
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}