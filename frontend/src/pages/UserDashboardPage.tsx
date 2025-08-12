import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth, DashboardNotification } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/hooks/useNotifications';
import { 
  apiService, 
  DashboardData, 
  WindowsVersion, 
  InstallData, 
  CreateInstallRequest,
  TopupTransaction
} from '@/services/api';
import { 
  Code, 
  LogOut, 
  User, 
  Settings, 
  Bell,
  Monitor,
  History,
  ChevronDown,
  AlertCircle,
  CheckCircle,
  Loader2,
  Plus,
  Clock,
  Shield,
  CreditCard,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  QrCode,
  Eye,
  EyeOff,
  XCircle,
  Activity,
  TrendingUp,
  Coins,
  Server,
  RefreshCw,
  ExternalLink,
  Download,
  Copy
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import TopupModal from '@/components/TopupModal';

// Schema validation for install form
const installSchema = z.object({
  ip: z.string()
    .min(1, 'IP address is required')
    .regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, 'Invalid IPv4 address'),
  passwd_vps: z.string().min(1, 'VPS password is required'),
  win_ver: z.string().min(1, 'Windows version is required'),
  passwd_rdp: z.string()
    .min(4, 'RDP password must be at least 4 characters')
    .refine((password) => !password.startsWith('#'), {
      message: 'RDP password cannot start with "#" character'
    }),
});

type InstallFormData = z.infer<typeof installSchema>;

interface PaymentModalData {
  reference: string;
  checkout_url: string;
  qr_url?: string;
  pay_code?: string;
  payment_name: string;
  final_amount: number;
  status: string;
  expired_time: number;
}

const ITEMS_PER_PAGE = 15;

export default function UserDashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [windowsVersions, setWindowsVersions] = useState<WindowsVersion[]>([]);
  const [installHistory, setInstallHistory] = useState<InstallData[]>([]);
  const [topupHistory, setTopupHistory] = useState<TopupTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTopup, setIsLoadingTopup] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'install' | 'install-history' | 'topup-history' | 'settings'>('dashboard');
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalData, setPaymentModalData] = useState<PaymentModalData | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TopupTransaction | null>(null);
  const [showTransactionDetails, setShowTransactionDetails] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showRdpPassword, setShowRdpPassword] = useState(false);
  const [showVpsPassword, setShowVpsPassword] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showRdpModal, setShowRdpModal] = useState(false);
  const [selectedInstall, setSelectedInstall] = useState<InstallData | null>(null);
  
  // Settings states
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isConnectingTelegram, setIsConnectingTelegram] = useState(false);
  const [telegramNotifications, setTelegramNotifications] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  // Pagination states
  const [installHistoryPage, setInstallHistoryPage] = useState(1);
  const [topupHistoryPage, setTopupHistoryPage] = useState(1);

  const { state, logout, clearNotifications } = useAuth();
  const { toast } = useToast();
  const { notifications } = useNotifications();
  const navigate = useNavigate();

  // Form validation using react-hook-form
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<InstallFormData>({
    resolver: zodResolver(installSchema),
  });

  // Update unread count and HTML title when notifications change
  useEffect(() => {
    const count = notifications.length;
    setUnreadCount(count);
    
    // Update HTML title with notification counter
    const originalTitle = "XME Projects - Turn your VPS into Windows RDP seamlessly";
    if (count > 0) {
      document.title = `(${count}) ${originalTitle}`;
    } else {
      document.title = originalTitle;
    }
    
    // Cleanup: Reset title when component unmounts
    return () => {
      document.title = originalTitle;
    };
  }, [notifications]);

  // Auto-refresh dashboard data when installation status or telegram connection notifications are received
  useEffect(() => {
    console.log('📱 Notifications updated:', notifications.length, notifications);
    
    // Check if there are new installation status notifications
    const hasInstallStatusNotifications = notifications.some(notification =>
      notification.type === 'install_status_update' ||
      ['completed', 'failed', 'running', 'pending', 'preparing'].includes(notification.status || '')
    );
    
    // Check if there are new telegram connection notifications
    const hasTelegramConnectionNotifications = notifications.some(notification =>
      notification.type === 'telegram_connection_success'
    );
    
    console.log('🔍 Has install status notifications:', hasInstallStatusNotifications);
    console.log('🔍 Has telegram connection notifications:', hasTelegramConnectionNotifications);
    
    if (hasInstallStatusNotifications) {
      console.log('🔄 Installation status notification received, refreshing dashboard data...');
      loadData();
    }
    
    if (hasTelegramConnectionNotifications) {
      console.log('🔄 Telegram connection notification received, refreshing dashboard data...');
      loadData();
      
      // Stop connecting state and show success message
      setIsConnectingTelegram(false);
      
      // Find the telegram connection notification
      const telegramNotification = notifications.find(n => n.type === 'telegram_connection_success');
      if (telegramNotification) {
        toast({
          title: '🎉 Telegram Connected Successfully!',
          description: telegramNotification.message,
        });
        
        // Auto-enable notifications
        const enableNotifications = async () => {
          try {
            await apiService.updateTelegramNotifications({ enabled: true });
            setTelegramNotifications(true);
          } catch (error) {
            console.error('Failed to auto-enable Telegram notifications:', error);
            setTelegramNotifications(true); // Still update local state
          }
        };
        
        enableNotifications();
      }
    }
  }, [notifications]);

  useEffect(() => {
    loadData();
  }, []);

  // Initialize settings states when user data is loaded
  useEffect(() => {
    if (dashboardData?.user) {
      // Initialize telegram notifications state based on user's current setting
      setTelegramNotifications(dashboardData.user.telegram_notifications || false);
    }
  }, [dashboardData]);

  // Check connection status only when user is actively trying to connect
  useEffect(() => {
    if (activeTab === 'settings' && dashboardData?.user && !dashboardData.user.telegram && isConnectingTelegram) {
      const interval = setInterval(() => {
        loadData(); // Refresh user data to check if Telegram was connected
      }, 3000); // Check every 3 seconds, only when actively connecting
      
      return () => clearInterval(interval);
    }
  }, [activeTab, dashboardData?.user?.telegram, isConnectingTelegram]);

  // This useEffect is no longer needed as we now use real-time notifications
  // The Telegram connection success is handled in the notifications useEffect above

  // Load topup history when topup tab is selected
  useEffect(() => {
    if (activeTab === 'topup-history') {
      loadTopupHistory();
    }
  }, [activeTab]);

  // Check for expired transactions periodically
  useEffect(() => {
    const checkExpiredTransactions = () => {
      const now = Math.floor(Date.now() / 1000);
      const updatedHistory = topupHistory.map(transaction => {
        if ((transaction.status === 'UNPAID' || transaction.status === 'PENDING') && 
            transaction.expired_time && transaction.expired_time < now) {
          return { ...transaction, status: 'EXPIRED' };
        }
        return transaction;
      });
      
      // Only update if there are changes
      const hasChanges = updatedHistory.some((transaction, index) => 
        transaction.status !== topupHistory[index]?.status
      );
      
      if (hasChanges) {
        setTopupHistory(updatedHistory);
      }
    };

    const interval = setInterval(checkExpiredTransactions, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [topupHistory]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [dashboardResponse, versionsResponse, historyResponse] = await Promise.all([
        apiService.getDashboard(),
        apiService.getWindowsVersions(),
        apiService.getInstallHistory()
      ]);

      if (dashboardResponse.data.success && dashboardResponse.data.data) {
        setDashboardData(dashboardResponse.data.data);
      }
      
      if (versionsResponse.data.success && versionsResponse.data.data) {
        setWindowsVersions(versionsResponse.data.data);
      }
      
      if (historyResponse.data.success && historyResponse.data.data) {
        setInstallHistory(historyResponse.data.data);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to load data',
        description: error.response?.data?.message || 'Please try refreshing the page.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadTopupHistory = async () => {
    try {
      setIsLoadingTopup(true);
      const response = await apiService.getTopupHistory();
      
      if (response.data.success && response.data.data) {
        // Check for expired transactions
        const now = Math.floor(Date.now() / 1000);
        const updatedTransactions = response.data.data.map((transaction: TopupTransaction) => {
          if ((transaction.status === 'UNPAID' || transaction.status === 'PENDING') && 
              transaction.expired_time && transaction.expired_time < now) {
            return { ...transaction, status: 'EXPIRED' };
          }
          return transaction;
        });
        setTopupHistory(updatedTransactions);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to load topup history',
        description: error.response?.data?.message || 'Please try again.',
      });
    } finally {
      setIsLoadingTopup(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      navigate('/');
    }
  };

  // Updated install submit with form validation
  const onInstallSubmit = async (data: InstallFormData) => {
    if (!dashboardData?.user.quota || dashboardData.user.quota <= 0) {
      toast({
        variant: 'destructive',
        title: 'Insufficient quota',
        description: 'You need at least 1 quota to install Windows.',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await apiService.createInstall(data);
      
      if (response.data.success) {
        toast({
          title: 'Installation started',
          description: 'Windows installation has been initiated. You will be notified when it completes.',
        });
        
        // Reset form and reload data
        reset();
        await loadData();
        setActiveTab('install-history');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Installation failed',
        description: error.response?.data?.message || 'Failed to start installation',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getWindowsVersionName = (slug: string) => {
    const version = windowsVersions.find(v => v.slug === slug);
    return version ? version.name : slug;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Completed
        </Badge>;
      case 'running':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          <Activity className="w-3 h-3 mr-1" />
          Running
        </Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>;
      case 'preparing':
        return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
          <RefreshCw className="w-3 h-3 mr-1" />
          Preparing
        </Badge>;
      case 'failed':
        return <Badge variant="destructive">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>;
      case 'manual_review':
        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          Manual Review
        </Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleRDPConnect = (install: InstallData) => {
    setSelectedInstall(install);
    setShowRdpModal(true);
  };

  const downloadRdpFile = (install: InstallData) => {
    const rdpContent = `screen mode id:i:2
use multimon:i:0
desktopwidth:i:1920
desktopheight:i:1200
session bpp:i:32
winposstr:s:0,3,0,0,800,600
compression:i:1
keyboardhook:i:2
audiocapturemode:i:0
videoplaybackmode:i:1
connection type:i:7
networkautodetect:i:1
bandwidthautodetect:i:1
displayconnectionbar:i:1
enableworkspacereconnect:i:0
remoteappmousemoveinject:i:1
disable wallpaper:i:0
allow font smoothing:i:0
allow desktop composition:i:0
disable full window drag:i:1
disable menu anims:i:1
disable themes:i:0
disable cursor setting:i:0
bitmapcachepersistenable:i:1
full address:s:${install.ip}:22
audiomode:i:0
redirectprinters:i:1
redirectlocation:i:0
redirectcomports:i:0
redirectsmartcards:i:1
redirectwebauthn:i:1
redirectclipboard:i:1
redirectposdevices:i:0
autoreconnection enabled:i:1
authentication level:i:2
prompt for credentials:i:0
negotiate security layer:i:1
remoteapplicationmode:i:0
alternate shell:s:
shell working directory:s:
gatewayhostname:s:
gatewayusagemethod:i:4
gatewaycredentialssource:i:4
gatewayprofileusagemethod:i:0
promptcredentialonce:i:0
gatewaybrokeringtype:i:0
use redirection server name:i:0
rdgiskdcproxy:i:0
kdcproxyname:s:
enablerdsaadauth:i:0
username:s:Administrator`;

    const blob = new Blob([rdpContent], { type: 'application/x-rdp' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${install.ip}-rdp.rdp`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast({
      title: "RDP File Downloaded",
      description: "Double-click the downloaded .rdp file to connect to your Windows server.",
    });
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: `${label} Copied`,
        description: `${label} has been copied to clipboard.`,
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Could not copy to clipboard.",
        variant: "destructive"
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTopupStatusBadge = (status: string) => {
    const statusConfig = {
      'PAID': { variant: 'default' as const, label: 'Paid', className: 'bg-green-500' },
      'UNPAID': { variant: 'secondary' as const, label: 'Unpaid', className: 'bg-yellow-500' },
      'PENDING': { variant: 'secondary' as const, label: 'Pending', className: 'bg-yellow-500' },
      'EXPIRED': { variant: 'destructive' as const, label: 'Expired', className: '' },
      'FAILED': { variant: 'destructive' as const, label: 'Failed', className: '' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || 
                   { variant: 'secondary' as const, label: status, className: '' };

    return (
      <Badge variant={config.variant} className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const handlePayTransaction = (transaction: TopupTransaction) => {
    if (transaction.checkout_url) {
      setPaymentModalData({
        reference: transaction.reference,
        checkout_url: transaction.checkout_url,
        qr_url: (transaction as any).qr_url || `https://tripay.co.id/qr/${transaction.reference}`,
        pay_code: (transaction as any).pay_code,
        payment_name: transaction.payment_method,
        final_amount: transaction.final_amount,
        status: transaction.status,
        expired_time: transaction.expired_time
      });
      setShowPaymentModal(true);
    } else {
      toast({
        variant: 'destructive',
        title: 'Payment URL not available',
        description: 'This transaction cannot be paid. Please create a new topup.',
      });
    }
  };

  const handleViewDetails = (transaction: TopupTransaction) => {
    setSelectedTransaction(transaction);
    setShowTransactionDetails(true);
  };

  const isTransactionPayable = (transaction: TopupTransaction) => {
    if (transaction.status !== 'UNPAID' && transaction.status !== 'PENDING') {
      return false;
    }
    
    // Check if not expired
    const now = Math.floor(Date.now() / 1000);
    return transaction.expired_time > now;
  };

  // Pagination helpers
  const getPaginatedData = <T,>(data: T[], page: number): T[] => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return data.slice(startIndex, endIndex);
  };

  const getTotalPages = (totalItems: number): number => {
    return Math.ceil(totalItems / ITEMS_PER_PAGE);
  };

  const renderPagination = (currentPage: number, totalItems: number, onPageChange: (page: number) => void) => {
    const totalPages = getTotalPages(totalItems);
    
    if (totalPages <= 1) return null;

    return (
      <div className="flex w-full items-center justify-between mt-6">
        <p className="text-xs text-muted-foreground w-full">
          Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of {totalItems} entries
        </p>
        
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
            </PaginationItem>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <PaginationItem key={page}>
                <PaginationLink
                  onClick={() => onPageChange(page)}
                  isActive={page === currentPage}
                  className="cursor-pointer"
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
            ))}
            
            <PaginationItem>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
  };

  // Password update handler
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Password mismatch',
        description: 'New password and confirm password must match.',
      });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Invalid password',
        description: 'Password must be at least 6 characters long.',
      });
      return;
    }

    try {
      setIsUpdatingPassword(true);
      
      // Call API to update password
      await apiService.updatePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      
      toast({
        title: 'Password updated',
        description: 'Your password has been updated successfully.',
      });
      
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.response?.data?.message || 'Failed to update password.',
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Telegram connection handler
  const handleConnectTelegram = async () => {
    try {
      setIsConnectingTelegram(true);
      
      // Call API to get Telegram connection URL/token
      const response = await apiService.connectTelegram();
      
      if (response.data.success && response.data.data?.telegramBotUrl) {
        // Open Telegram bot link in new tab
        window.open(response.data.data.telegramBotUrl, '_blank');
        
        toast({
          title: 'Telegram Connection Started',
          description: `Connection link generated! The link expires in ${(response.data.data as any).expiresInMinutes || 10} minutes.`,
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Connection failed',
        description: error.response?.data?.message || 'Failed to initiate Telegram connection.',
      });
    } finally {
      setIsConnectingTelegram(false);
    }
  };

  // Disconnect Telegram handler
  const handleDisconnectTelegram = async () => {
    if (!confirm('Are you sure you want to disconnect your Telegram account?')) {
      return;
    }

    try {
      // Call API to disconnect Telegram
      const response = await apiService.disconnectTelegram();
      
      if (response.data.success) {
        toast({
          title: 'Telegram Disconnected',
          description: 'Your Telegram account has been disconnected successfully.',
        });
        
        // Refresh user data
        await loadData();
        setTelegramNotifications(false);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Disconnect failed',
        description: error.response?.data?.message || 'Failed to disconnect Telegram account.',
      });
    }
  };

  // Toggle Telegram notifications
  const handleToggleTelegramNotifications = async (enabled: boolean) => {
    try {
      await apiService.updateTelegramNotifications({ enabled });
      setTelegramNotifications(enabled);
      
      toast({
        title: 'Notification settings updated',
        description: `Telegram notifications ${enabled ? 'enabled' : 'disabled'} successfully.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.response?.data?.message || 'Failed to update notification settings.',
      });
    }
  };

  // Sidebar menu items
  const menuItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'install',
      label: 'Install Windows',
      icon: Download,
    },
    {
      id: 'install-history',
      label: 'Install History',
      icon: History,
    },
    {
      id: 'topup-history',
      label: 'Topup History',
      icon: CreditCard,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
    },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-4 text-destructive" />
          <p className="text-muted-foreground">Failed to load dashboard data</p>
          <Button onClick={loadData} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const user = dashboardData.user;

  // Get paginated data
  const paginatedInstallHistory = getPaginatedData(installHistory, installHistoryPage);
  const paginatedTopupHistory = getPaginatedData(topupHistory, topupHistoryPage);

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
            
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <Code className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-md md:text-xl font-bold">XME Projects</h1>
              <p className="text-sm text-muted-foreground hidden sm:block">User Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-4">
            {/* Notifications Bell */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
              
              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute left-1/2 transform -translate-x-1/2 sm:left-auto sm:right-0 sm:transform-none top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-1rem)] bg-background border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                  <div className="p-4 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">Notifications</h3>
                        <p className="text-sm text-muted-foreground">{notifications.length} new notifications</p>
                      </div>
                      {notifications.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            clearNotifications();
                            setShowNotifications(false);
                            toast({
                              title: "Notifications cleared",
                              description: "All notifications have been removed.",
                            });
                          }}
                          className="ml-2"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No new notifications</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-64">
                      <div>
                        {notifications.map((notification, index) => (
                          <div key={index} className="p-4 border-b last:border-b-0 hover:bg-muted/50">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-0.5">
                                {notification.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                                {notification.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                                {notification.status === 'running' && <Activity className="h-4 w-4 text-blue-500" />}
                                {notification.status === 'pending' && <Clock className="h-4 w-4 text-yellow-500" />}
                                {notification.status === 'preparing' && <RefreshCw className="h-4 w-4 text-purple-500" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{notification.message}</p>
                                {notification.ip && (
                                  <p className="text-xs text-muted-foreground">IP: {notification.ip}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  {new Date(notification.timestamp).toLocaleString('id-ID', {
                                    timeZone: 'Asia/Jakarta',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    day: 'numeric',
                                    month: 'short'
                                  })}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              )}
            </div>

            <ThemeToggle />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user.profile?.avatar_url} />
                    <AvatarFallback>
                      {user.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline">{user.username}</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setActiveTab('settings')}
                  className="cursor-pointer"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Fixed Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-background border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className="flex flex-col h-full">
            {/* Sidebar Header Spacer */}
            <div className="h-16 md:h-20 flex items-center px-6">
            </div>

            {/* Sidebar Content */}
            <div className="flex-1 flex flex-col min-h-0">
              <ScrollArea className="flex-1">
                <div className="px-4 py-6">
                  <nav className="space-y-2">
                    {menuItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id as any);
                            setSidebarOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </nav>
                </div>
              </ScrollArea>
              
              {/* Quota Card in Sidebar */}
              <div className="p-4 border-t">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground mb-1">Current Quota</p>
                      <p className="text-2xl font-bold text-foreground mb-3">{dashboardData.stats.quota || 0}</p>
                      <Button 
                        onClick={() => setShowTopupModal(true)}
                        size="sm" 
                        className="w-full"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Topup
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 lg:ml-64 pt-20">
          <div className="container mx-auto px-6 pt-2 pb-6 md:py-8">
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Welcome Section */}
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                        Welcome back, {user.profile?.first_name || user.username}!
                      </h2>
                      <p className="text-xs md:text-sm text-muted-foreground">
                        Manage your Windows installations
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!user.is_verified && (
                        <Badge variant="destructive">
                          Email not verified
                        </Badge>
                      )}
                      {user.admin === 1 && (
                        <Badge variant="secondary">
                          <Shield className="w-3 h-3 mr-1" />
                          Admin
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Email Verification Alert */}
                  {!user.is_verified && (
                    <Alert className="mb-6 border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30">
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                      <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                        Please verify your email address to access all features.{' '}
                        <Button variant="link" className="p-0 h-auto text-yellow-800 dark:text-yellow-200" asChild>
                          <Link to="/verify-email">Verify now</Link>
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {/* Stats Grid - Updated with new stats */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs md:text-sm font-medium text-muted-foreground">Total VPS</p>
                          <p className="text-2xl font-bold text-foreground">{dashboardData.stats.totalVPS}</p>
                        </div>
                        <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Server className="h-6 w-6 text-primary" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs md:text-sm font-medium text-muted-foreground">Active Install</p>
                          <p className="text-2xl font-bold text-foreground">{dashboardData.stats.activeConnections}</p>
                        </div>
                        <div className="h-12 w-12 bg-green-500/10 rounded-lg flex items-center justify-center">
                          <Activity className="h-6 w-6 text-green-600 dark:text-green-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className='col-span-2 md:col-span-1'>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs md:text-sm font-medium text-muted-foreground">Success Rate</p>
                          <p className="text-2xl font-bold text-foreground">{dashboardData.stats.successRate}</p>
                        </div>
                        <div className="h-12 w-12 bg-purple-500/10 rounded-lg flex items-center justify-center">
                          <TrendingUp className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Quick Actions and Recent Activity */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Quick Actions */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Quick Actions</CardTitle>
                      <CardDescription>Common tasks and shortcuts</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <Button 
                          onClick={() => setActiveTab('install')}
                          className="w-full justify-start h-16"
                          variant="outline"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
                              <Download className="h-5 w-5 text-primary" />
                            </div>
                            <div className="text-left">
                              <p className="font-medium">Install Windows</p>
                              <p className="text-xs md:text-sm text-muted-foreground">Create new installation</p>
                            </div>
                          </div>
                        </Button>
                        
                        <Button 
                          onClick={() => setShowTopupModal(true)}
                          className="w-full justify-start h-16"
                          variant="outline"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                              <Plus className="h-5 w-5 text-green-600" />
                            </div>
                            <div className="text-left">
                              <p className="font-medium">Topup Quota</p>
                              <p className="text-xs md:text-sm text-muted-foreground">Add more quota</p>
                            </div>
                          </div>
                        </Button>
                        
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recent Activity */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Activity</CardTitle>
                      <CardDescription>
                        Your latest installations
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {dashboardData.recentActivity && dashboardData.recentActivity.length === 0 ? (
                        <div className="text-center py-8">
                          <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">No installations yet</p>
                          <p className="text-sm text-muted-foreground">Start by installing Windows on your VPS</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-3">
                            {(dashboardData.recentActivity || installHistory).slice(0, 2).map((install: any) => (
                              <div key={install.id} className="flex items-center justify-between p-3 border rounded-lg">
                                <div className="flex items-center gap-3">
                                  <Monitor className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <p className="font-medium">{install.ip}</p>
                                    <p className="text-sm text-muted-foreground">{install.win_ver}</p>
                                  </div>
                                </div>
                                {getStatusBadge(install.status)}
                              </div>
                            ))}
                          </div>
                          {installHistory.length > 2 && (
                            <div className="pt-3 border-t">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveTab('install-history')}
                                className="w-full"
                              >
                                <History className="h-4 w-4 mr-2" />
                                View All Installations ({installHistory.length})
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* Install Windows Tab */}
            {activeTab === 'install' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Install Windows</h2>
                  <p className="text-xs md:text-sm text-muted-foreground">Transform your Linux VPS into a Windows RDP environment</p>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Installation Details</CardTitle>
                    <CardDescription>
                      Fill in the details for your Windows installation
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {dashboardData.stats.quota <= 0 ? (
                      <Alert>
                        <div className="flex items-start space-x-3">
                          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <AlertDescription>
                            You don't have enough quota to install Windows. Please top up your quota first.
                            <Button 
                              onClick={() => setShowTopupModal(true)}
                              variant="link" 
                              className="p-0 ml-2 h-auto"
                            >
                              Top up now
                            </Button>
                          </AlertDescription>
                          </div>
                      </Alert>
                    ) : (
                      <form onSubmit={handleSubmit(onInstallSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label htmlFor="ip">VPS IP Address *</Label>
                            <Input
                              id="ip"
                              placeholder="192.168.1.100"
                              {...register('ip')}
                              className={errors.ip ? 'border-destructive' : ''}
                            />
                            {errors.ip && (
                              <p className="text-sm text-destructive">{errors.ip.message}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Ubuntu 22 is Recommended
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="passwd_vps">VPS Root Password *</Label>
                            <div className="relative">
                              <Input
                                id="passwd_vps"
                                type={showVpsPassword ? 'text' : 'password'}
                                placeholder="Your VPS root password"
                                {...register('passwd_vps')}
                                className={errors.passwd_vps ? 'border-destructive pr-10' : 'pr-10'}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowVpsPassword(!showVpsPassword)}
                              >
                                {showVpsPassword ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                            {errors.passwd_vps && (
                              <p className="text-sm text-destructive">{errors.passwd_vps.message}</p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="win_ver">Windows Version *</Label>
                            <Select onValueChange={(value) => setValue('win_ver', value)}>
                              <SelectTrigger className={errors.win_ver ? 'border-destructive' : ''}>
                                <SelectValue placeholder="Select Windows version" />
                              </SelectTrigger>
                              <SelectContent>
                                {windowsVersions.map((version) => (
                                  <SelectItem key={version.id} value={version.slug}>
                                    {version.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {errors.win_ver && (
                              <p className="text-sm text-destructive">{errors.win_ver.message}</p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="passwd_rdp">RDP Password *</Label>
                            <div className="relative">
                              <Input
                                id="passwd_rdp"
                                type={showRdpPassword ? 'text' : 'password'}
                                placeholder="Windows RDP password"
                                {...register('passwd_rdp')}
                                className={errors.passwd_rdp ? 'border-destructive pr-10' : 'pr-10'}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowRdpPassword(!showRdpPassword)}
                              >
                                {showRdpPassword ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                            {errors.passwd_rdp && (
                              <p className="text-sm text-destructive">{errors.passwd_rdp.message}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Cannot start with #
                            </p>
                          </div>
                        </div>

                        <Button 
                          type="submit" 
                          className="w-full"
                          disabled={isSubmitting || dashboardData.stats.quota <= 0}
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Starting Installation...
                            </>
                          ) : (
                            <>
                              <Plus className="mr-2 h-4 w-4" />
                              Start Installation (1 Quota)
                            </>
                          )}
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Install History Tab */}
            {activeTab === 'install-history' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Install History</h2>
                    <p className="text-xs md:text-sm text-muted-foreground">View your Windows installation history</p>
                  </div>
                  <Button onClick={loadData} variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>

                <Card>
                  <CardContent className="p-6 h-[550px]">
                    {installHistory.length === 0 ? (
                      <div className="text-center py-8">
                        <Monitor className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground mb-2">No installations yet</p>
                        <p className="text-sm text-muted-foreground mb-4">
                          Your installation history will appear here
                        </p>
                        <Button 
                          onClick={() => setActiveTab('install')} 
                        >
                          Create Your First Install
                        </Button>
                      </div>
                    ) : (
                      <>
                        {/* Desktop Table View */}
                        <div className="hidden md:block">
                          <ScrollArea className="h-[440px]">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-12">#</TableHead>
                                  <TableHead>IP Address</TableHead>
                                  <TableHead>Windows Version</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Created</TableHead>
                                  <TableHead>Updated</TableHead>
                                  <TableHead className="w-24">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {paginatedInstallHistory.map((install, index) => (
                                  <TableRow key={install.id}>
                                    <TableCell className="font-medium">
                                      {(installHistoryPage - 1) * ITEMS_PER_PAGE + index + 1}
                                    </TableCell>
                                    <TableCell className="font-mono">{install.ip}</TableCell>
                                    <TableCell>{getWindowsVersionName(install.win_ver)}</TableCell>
                                    <TableCell>{getStatusBadge(install.status)}</TableCell>
                                    <TableCell>{formatDate(install.created_at)}</TableCell>
                                    <TableCell>{formatDate(install.updated_at)}</TableCell>
                                    <TableCell>
                                      {install.status === 'completed' && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleRDPConnect(install)}
                                          className="h-8"
                                        >
                                          <ExternalLink className="h-3 w-3 mr-1" />
                                          Connect
                                        </Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </div>

                        {/* Mobile Card View */}
                        <div className="md:hidden">
                          <ScrollArea className="h-[440px]">
                            <div className="space-y-3 pr-4">
                              {paginatedInstallHistory.map((install, index) => (
                                <Card key={install.id}>
                                  <CardContent className="p-4">
                                    <div className="flex items-start justify-between mb-3">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-xs">
                                          #{(installHistoryPage - 1) * ITEMS_PER_PAGE + index + 1}
                                        </Badge>
                                        <span className="font-mono text-sm font-medium">{install.ip}</span>
                                      </div>
                                      {getStatusBadge(install.status)}
                                    </div>
                                    
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Windows:</span>
                                        <span className="font-medium">{getWindowsVersionName(install.win_ver)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Created:</span>
                                        <span>{formatDate(install.created_at)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Updated:</span>
                                        <span>{formatDate(install.updated_at)}</span>
                                      </div>
                                    </div>
                                    
                                    {install.status === 'completed' && (
                                      <div className="mt-3 pt-3 border-t">
                                        <Button
                                          size="sm"
                                          onClick={() => handleRDPConnect(install)}
                                          className="w-full"
                                        >
                                          <ExternalLink className="h-4 w-4 mr-2" />
                                          Connect to RDP
                                        </Button>
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                        
                        {renderPagination(installHistoryPage, installHistory.length, setInstallHistoryPage)}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Topup History Tab */}
            {activeTab === 'topup-history' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Topup History</h2>
                    <p className="text-xs md:text-sm text-muted-foreground">View your quota topup transaction history</p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      onClick={loadTopupHistory}
                      disabled={isLoadingTopup}
                    >
                      {isLoadingTopup ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <History className="h-4 w-4 mr-2" />
                      )}
                      Refresh
                    </Button>
                  </div>
                </div>

                <Card>
                  <CardContent className="p-6 h-[550px]">
                    {isLoadingTopup ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin" />
                      </div>
                    ) : topupHistory.length === 0 ? (
                      <div className="text-center py-8">
                        <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground mb-2">No transactions found</p>
                        <p className="text-sm text-muted-foreground mb-4">
                          Your topup history will appear here
                        </p>
                      </div>
                    ) : (
                      <>
                        <ScrollArea className="h-[440px]">
                          <div className="space-y-3 pr-4">
                            {paginatedTopupHistory.map((transaction) => (
                              <Card key={transaction.id} className="hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                                        <CreditCard className="h-5 w-5 text-primary" />
                                      </div>
                                      <div>
                                        <p className="font-medium">{transaction.quantity} Quota Purchase</p>
                                        <p className="text-sm text-muted-foreground">
                                          {formatCurrency(transaction.final_amount)}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {getTopupStatusBadge(transaction.status)}
                                    </div>
                                  </div>

                                  <div className="mt-3 flex items-center justify-between">
                                    <div className="text-xs md:text-sm text-muted-foreground">
                                      {formatDate(transaction.created_at)}
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleViewDetails(transaction)}
                                      >
                                        View Details
                                      </Button>
                                      {isTransactionPayable(transaction) && (
                                        <Button
                                          size="sm"
                                          onClick={() => handlePayTransaction(transaction)}
                                          className="bg-green-600 hover:bg-green-700"
                                        >
                                          <CreditCard className="h-4 w-4 mr-1" />
                                          Pay
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </ScrollArea>
                        
                        {renderPagination(topupHistoryPage, topupHistory.length, setTopupHistoryPage)}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Settings</h2>
                  <p className="text-xs md:text-sm text-muted-foreground">Manage your account settings and preferences</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Update Password Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Update Password
                      </CardTitle>
                      <CardDescription>
                        Change your account password for security
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleUpdatePassword} className="space-y-4">
                        <div>
                          <Label htmlFor="currentPassword">Current Password</Label>
                          <Input
                            id="currentPassword"
                            type="password"
                            value={passwordForm.currentPassword}
                            onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                            placeholder="Enter your current password"
                            required
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="newPassword">New Password</Label>
                          <Input
                            id="newPassword"
                            type="password"
                            value={passwordForm.newPassword}
                            onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                            placeholder="Enter new password"
                            required
                            minLength={6}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Password must be at least 6 characters long
                          </p>
                        </div>
                        
                        <div>
                          <Label htmlFor="confirmPassword">Confirm New Password</Label>
                          <Input
                            id="confirmPassword"
                            type="password"
                            value={passwordForm.confirmPassword}
                            onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            placeholder="Confirm your new password"
                            required
                          />
                        </div>
                        
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={isUpdatingPassword || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
                        >
                          {isUpdatingPassword ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Updating Password...
                            </>
                          ) : (
                            <>
                              <Shield className="mr-2 h-4 w-4" />
                              Update Password
                            </>
                          )}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  {/* Telegram Connection Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5" />
                        Telegram Connection
                      </CardTitle>
                      <CardDescription>
                        Connect your Telegram account to receive notifications
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {user.telegram ? (
                        <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50 dark:bg-green-950/20">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-green-500/10 rounded-full flex items-center justify-center">
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                              <p className="font-medium text-green-900 dark:text-green-100">Telegram Connected</p>
                              <p className="text-sm text-green-600 dark:text-green-300">
                                {user.telegram_display_name ? (
                                  <>
                                    {user.telegram_display_name} {user.telegram && `(@${user.telegram})`}
                                  </>
                                ) : (
                                  `@${user.telegram}`
                                )}
                              </p>
                              {user.telegram_user_id && (
                                <p className="text-xs text-green-500 dark:text-green-400">
                                  ID: {user.telegram_user_id}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Telegram Notifications Toggle */}
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="telegram-notifications" className="text-sm font-medium">
                              Installation Notifications
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Get notified about installation status updates via Telegram
                            </p>
                          </div>
                          <Button
                            variant={telegramNotifications ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleToggleTelegramNotifications(!telegramNotifications)}
                            className="ml-4"
                          >
                            {telegramNotifications ? "On" : "Off"}
                          </Button>
                        </div>
                        
                        <Button
                          variant="outline"
                          onClick={handleDisconnectTelegram}
                          className="w-full"
                        >
                          <X className="mr-2 h-4 w-4" />
                          Disconnect Telegram
                        </Button>
                      </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="text-center py-6">
                            <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-muted-foreground mb-2">No Telegram account connected</p>
                            <p className="text-sm text-muted-foreground">
                              Connect your Telegram account to receive real-time notifications about your Windows installations
                            </p>
                          </div>
                          
                          <Button
                            onClick={handleConnectTelegram}
                            disabled={isConnectingTelegram}
                            className="w-full"
                          >
                            {isConnectingTelegram ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Connecting...
                              </>
                            ) : (
                              <>
                                <Bell className="mr-2 h-4 w-4" />
                                Connect Telegram
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Profile Information Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Profile Information
                    </CardTitle>
                    <CardDescription>
                      Your account details and information
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label>Username</Label>
                        <div className="flex items-center gap-3 mt-1">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.profile?.avatar_url} />
                            <AvatarFallback>
                              {user.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{user.username}</span>
                        </div>
                      </div>
                      
                      <div>
                        <Label>Email Address</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-medium">{user.email}</span>
                          <Badge variant={user.is_verified ? "default" : "destructive"}>
                            {user.is_verified ? "Verified" : "Unverified"}
                          </Badge>
                        </div>
                      </div>
                      
                      <div>
                        <Label>Current Quota</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-lg px-3 py-1">
                            {dashboardData.stats.quota || 0}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowTopupModal(true)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Topup
                          </Button>
                        </div>
                      </div>
                      
                      <div>
                        <Label>Account Type</Label>
                        <div className="mt-1">
                          <Badge variant={user.admin === 1 ? "default" : "secondary"}>
                            {user.admin === 1 ? "Administrator" : "User"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Topup Modal */}
      <TopupModal 
        open={showTopupModal}
        onOpenChange={setShowTopupModal}
        onSuccess={() => {
          // Reload dashboard data after successful topup
          loadData();
          // Also reload topup history if we're on that tab
          if (activeTab === 'topup-history') {
            loadTopupHistory();
          }
          setShowTopupModal(false);
        }}
      />

      {/* Payment Modal for existing transactions with QR Code */}
      {paymentModalData && (
        <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Complete Payment
              </DialogTitle>
              <DialogDescription>
                Complete your payment for transaction {paymentModalData.reference}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* QR Code Section */}
              {paymentModalData.qr_url && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <QrCode className="h-4 w-4" />
                    <span className="text-sm font-medium">Scan QR Code to Pay</span>
                  </div>
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-lg border">
                      <img
                        src={paymentModalData.qr_url}
                        alt="Payment QR Code"
                        className="w-48 h-48 object-contain"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Scan with your mobile banking or e-wallet app
                  </p>
                </div>
              )}

              {/* Transaction Details */}
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Reference:</span>
                      <span className="font-mono text-xs">{paymentModalData.reference}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Amount:</span>
                      <span className="font-semibold">{formatCurrency(paymentModalData.final_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Payment:</span>
                      <span>{paymentModalData.payment_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Status:</span>
                      {getTopupStatusBadge(paymentModalData.status)}
                    </div>
                    {paymentModalData.pay_code && (
                      <div className="flex justify-between">
                        <span>Pay Code:</span>
                        <span className="font-mono">{paymentModalData.pay_code}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Expires:</span>
                      <span className="text-red-600 font-medium">
                        {new Date(paymentModalData.expired_time * 1000).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1"
                >
                  Done
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Transaction Details Modal */}
      {selectedTransaction && (
        <Dialog open={showTransactionDetails} onOpenChange={setShowTransactionDetails}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Transaction Details
              </DialogTitle>
              <DialogDescription>
                Detailed information for transaction {selectedTransaction.reference}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reference:</span>
                      <span className="font-mono text-xs">{selectedTransaction.reference}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Merchant Ref:</span>
                      <span className="font-mono text-xs">{selectedTransaction.merchant_ref}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Quantity:</span>
                      <span className="font-medium">{selectedTransaction.quantity} quota</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment Method:</span>
                      <span className="font-medium">{selectedTransaction.payment_method}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      {getTopupStatusBadge(selectedTransaction.status)}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created:</span>
                      <span className="font-medium">{formatDate(selectedTransaction.created_at)}</span>
                    </div>
                    {selectedTransaction.paid_at && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Paid:</span>
                        <span className="font-medium">{formatDate(selectedTransaction.paid_at)}</span>
                      </div>
                    )}
                    {selectedTransaction.pay_code && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pay Code:</span>
                        <span className="font-mono">{selectedTransaction.pay_code}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expires:</span>
                      <span className="font-medium text-red-600">
                        {new Date(selectedTransaction.expired_time * 1000).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {selectedTransaction.discount_amount > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Price Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(selectedTransaction.total_amount)}</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span>Discount ({selectedTransaction.discount_percentage}%):</span>
                      <span>-{formatCurrency(selectedTransaction.discount_amount)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-medium">
                      <span>Total:</span>
                      <span>{formatCurrency(selectedTransaction.final_amount)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-3">
                {isTransactionPayable(selectedTransaction) && (
                  <Button
                    onClick={() => {
                      setShowTransactionDetails(false);
                      handlePayTransaction(selectedTransaction);
                    }}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Pay Now
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setShowTransactionDetails(false)}
                  className={isTransactionPayable(selectedTransaction) ? "flex-1" : "w-full"}
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* RDP Connection Modal */}
      {selectedInstall && (
        <Dialog open={showRdpModal} onOpenChange={setShowRdpModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ExternalLink className="h-5 w-5" />
                Connect to Windows RDP
              </DialogTitle>
              <DialogDescription>
                Choose your preferred connection method for {selectedInstall.ip}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Connection Details Card */}
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Server:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{selectedInstall.ip}:22</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => copyToClipboard(`${selectedInstall.ip}:22`, "Server")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Username:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">Administrator</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => copyToClipboard("Administrator", "Username")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Password:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{selectedInstall.passwd_rdp}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => copyToClipboard(selectedInstall.passwd_rdp, "Password")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Windows:</span>
                      <span>{getWindowsVersionName(selectedInstall.win_ver)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Connection Options */}
              <div className="space-y-3">
                <Button
                  onClick={() => {
                    downloadRdpFile(selectedInstall);
                    setShowRdpModal(false);
                  }}
                  className="w-full justify-start"
                  variant="default"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download RDP File (Recommended)
                </Button>
              </div>

              {/* Instructions */}
              <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                <p className="font-medium mb-1">📝 Instructions:</p>
                <ul className="space-y-1">
                  <li>• <strong>RDP File:</strong> Double-click to open in Remote Desktop</li>
                  <li>• <strong>Manual:</strong> Open Remote Desktop Connection and use copy icons to get details</li>
                  <li>• <strong>Port:</strong> Make sure to use port 22 (not default 3389)</li>
                </ul>
              </div>

              <Button
                variant="outline"
                onClick={() => setShowRdpModal(false)}
                className="w-full"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Click outside to close notifications */}
      {showNotifications && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowNotifications(false)}
        />
      )}
    </div>
  );
}