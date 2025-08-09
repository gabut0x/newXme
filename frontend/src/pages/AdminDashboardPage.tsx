import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  apiService, 
  WindowsVersion, 
  Product, 
  User, 
  InstallData,
  CreateWindowsVersionRequest,
  CreateProductRequest,
  PaymentMethod
} from '@/services/api';
import { 
  Code, 
  LogOut, 
  Settings, 
  Bell,
  Monitor,
  Package,
  Users,
  Database,
  ChevronDown,
  AlertCircle,
  CheckCircle,
  Loader2,
  Plus,
  Edit,
  Trash2,
  Shield,
  Clock,
  Eye,
  CreditCard
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<'windows' | 'products' | 'users' | 'installs' | 'payments'>('windows');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Data states
  const [windowsVersions, setWindowsVersions] = useState<WindowsVersion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [installData, setInstallData] = useState<InstallData[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  
  // Dialog states
  const [windowsDialog, setWindowsDialog] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [editingWindows, setEditingWindows] = useState<WindowsVersion | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Form states
  const [windowsForm, setWindowsForm] = useState<CreateWindowsVersionRequest>({
    name: '',
    slug: ''
  });
  
  const [productForm, setProductForm] = useState<CreateProductRequest>({
    name: '',
    description: '',
    price: 0,
    image_url: ''
  });
  
  // Image upload state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const { state, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is admin
    if (state.user && state.user.admin !== 1) {
      toast({
        variant: 'destructive',
        title: 'Access Denied',
        description: 'You do not have admin privileges.',
      });
      navigate('/dashboard');
      return;
    }
    
    loadData();
  }, [state.user, navigate]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [windowsRes, productsRes, usersRes, installsRes, paymentsRes] = await Promise.all([
        apiService.getAdminWindowsVersions(),
        apiService.getAdminProducts(),
        apiService.getAdminUsers(),
        apiService.getAdminInstallData(),
        apiService.getAdminPaymentMethods()
      ]);

      if (windowsRes.data.data) setWindowsVersions(windowsRes.data.data);
      if (productsRes.data.data) setProducts(productsRes.data.data);
      if (usersRes.data.data) setUsers(usersRes.data.data);
      if (installsRes.data.data) setInstallData(installsRes.data.data);
      if (paymentsRes.data.data) setPaymentMethods(paymentsRes.data.data);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to load data',
        description: error.message || 'Please try refreshing the page.',
      });
    } finally {
      setIsLoading(false);
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

  // Windows Version handlers
  const handleWindowsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      
      if (editingWindows) {
        await apiService.updateWindowsVersion(editingWindows.id, windowsForm);
        toast({ title: 'Windows version updated successfully' });
      } else {
        await apiService.createWindowsVersion(windowsForm);
        toast({ title: 'Windows version created successfully' });
      }
      
      setWindowsDialog(false);
      setEditingWindows(null);
      setWindowsForm({ name: '', slug: '' });
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Operation failed',
        description: error.response?.data?.message || 'Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteWindows = async (id: number) => {
    if (!confirm('Are you sure you want to delete this Windows version?')) return;
    
    try {
      await apiService.deleteWindowsVersion(id);
      toast({ title: 'Windows version deleted successfully' });
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error.response?.data?.message || 'Please try again.',
      });
    }
  };

  // Product handlers
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      
      // Get token using the apiService method
      const token = apiService.getAuthToken();
      
      if (!token) {
        toast({
          variant: 'destructive',
          title: 'Authentication required',
          description: 'Please login again.',
        });
        return;
      }
      
      // Get the API base URL
      const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';
      
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('name', productForm.name);
      formData.append('description', productForm.description);
      formData.append('price', productForm.price.toString());
      
      if (selectedImage) {
        formData.append('image', selectedImage);
      }
      
      if (editingProduct) {
        // For update, we need to handle it differently since we might not have a new image
        const response = await fetch(`${apiBaseUrl}/admin/products/${editingProduct.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to update product');
        }
        
        toast({ title: 'Product updated successfully' });
      } else {
        // For create
        const response = await fetch(`${apiBaseUrl}/admin/products`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to create product');
        }
        
        toast({ title: 'Product created successfully' });
      }
      
      setProductDialog(false);
      setEditingProduct(null);
      setProductForm({ name: '', description: '', price: 0, image_url: '' });
      setSelectedImage(null);
      setImagePreview(null);
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Operation failed',
        description: error.message || 'Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
      await apiService.deleteProduct(id);
      toast({ title: 'Product deleted successfully' });
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error.response?.data?.message || 'Please try again.',
      });
    }
  };

  // User handlers
  const handleUpdateUser = async (userId: number, updates: { is_active?: boolean; admin?: number; telegram?: string }) => {
    try {
      await apiService.updateUser(userId, updates);
      toast({ title: 'User updated successfully' });
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.response?.data?.message || 'Please try again.',
      });
    }
  };

  // Install data handlers
  const handleUpdateInstallStatus = async (installId: number, status: string) => {
    try {
      await apiService.updateInstallData(installId, { status });
      toast({ title: 'Install status updated successfully' });
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.response?.data?.message || 'Please try again.',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'running':
        return <Badge variant="outline" className="text-blue-600"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
      case 'completed':
        return <Badge variant="outline" className="text-green-600"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">XME Projects Admin</h1>
              <p className="text-sm text-muted-foreground">Administrative Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              <Eye className="h-4 w-4 mr-2" />
              User View
            </Button>
            <ThemeToggle />
            <Button variant="ghost" size="sm">
              <Bell className="h-4 w-4" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback>
                      {state.user?.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline">{state.user?.username}</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem className="cursor-pointer">
                  <Settings className="h-4 w-4 mr-2" />
                  Admin Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Windows Versions</p>
                  <p className="text-2xl font-bold text-foreground">{windowsVersions.length}</p>
                </div>
                <Monitor className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Products</p>
                  <p className="text-2xl font-bold text-foreground">{products.length}</p>
                </div>
                <Package className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Users</p>
                  <p className="text-2xl font-bold text-foreground">{users.length}</p>
                </div>
                <Users className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Installs</p>
                  <p className="text-2xl font-bold text-foreground">{installData.length}</p>
                </div>
                <Database className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Payment Methods</p>
                  <p className="text-2xl font-bold text-foreground">{paymentMethods.filter(p => p.is_enabled).length}/{paymentMethods.length}</p>
                </div>
                <CreditCard className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-4 mb-6">
          <Button
            variant={activeTab === 'windows' ? 'default' : 'outline'}
            onClick={() => setActiveTab('windows')}
            className="flex items-center gap-2"
          >
            <Monitor className="h-4 w-4" />
            Windows Versions
          </Button>
          <Button
            variant={activeTab === 'products' ? 'default' : 'outline'}
            onClick={() => setActiveTab('products')}
            className="flex items-center gap-2"
          >
            <Package className="h-4 w-4" />
            Products
          </Button>
          <Button
            variant={activeTab === 'users' ? 'default' : 'outline'}
            onClick={() => setActiveTab('users')}
            className="flex items-center gap-2"
          >
            <Users className="h-4 w-4" />
            Users
          </Button>
          <Button
            variant={activeTab === 'installs' ? 'default' : 'outline'}
            onClick={() => setActiveTab('installs')}
            className="flex items-center gap-2"
          >
            <Database className="h-4 w-4" />
            Install Data
          </Button>
          <Button
            variant={activeTab === 'payments' ? 'default' : 'outline'}
            onClick={() => setActiveTab('payments')}
            className="flex items-center gap-2"
          >
            <CreditCard className="h-4 w-4" />
            Payment Methods
          </Button>
        </div>

        {/* Windows Versions Tab */}
        {activeTab === 'windows' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Windows Versions</CardTitle>
                <CardDescription>Manage available Windows versions</CardDescription>
              </div>
              <Dialog open={windowsDialog} onOpenChange={setWindowsDialog}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    setEditingWindows(null);
                    setWindowsForm({ name: '', slug: '' });
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Version
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingWindows ? 'Edit Windows Version' : 'Add Windows Version'}
                    </DialogTitle>
                    <DialogDescription>
                      {editingWindows ? 'Update the Windows version details' : 'Create a new Windows version'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleWindowsSubmit}>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="name">Name</Label>
                        <Input
                          id="name"
                          value={windowsForm.name}
                          onChange={(e) => setWindowsForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Windows 10 Spectre"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="slug">Slug</Label>
                        <Input
                          id="slug"
                          value={windowsForm.slug}
                          onChange={(e) => setWindowsForm(prev => ({ ...prev, slug: e.target.value }))}
                          placeholder="w10s"
                          required
                        />
                      </div>
                    </div>
                    <DialogFooter className="mt-6">
                      <Button type="button" variant="outline" onClick={() => setWindowsDialog(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {editingWindows ? 'Update' : 'Create'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {windowsVersions.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell className="font-medium">{version.name}</TableCell>
                      <TableCell className="font-mono">{version.slug}</TableCell>
                      <TableCell>{new Date(version.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingWindows(version);
                              setWindowsForm({ name: version.name, slug: version.slug });
                              setWindowsDialog(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteWindows(version.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Products Tab */}
        {activeTab === 'products' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Products</CardTitle>
                <CardDescription>Manage products and services</CardDescription>
              </div>
              <Dialog open={productDialog} onOpenChange={setProductDialog}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    setEditingProduct(null);
                    setProductForm({ name: '', description: '', price: 0, image_url: '' });
                    setSelectedImage(null);
                    setImagePreview(null);
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Product
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingProduct ? 'Edit Product' : 'Add Product'}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleProductSubmit}>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="product-name">Name</Label>
                        <Input
                          id="product-name"
                          value={productForm.name}
                          onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={productForm.description}
                          onChange={(e) => setProductForm(prev => ({ ...prev, description: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="price">Price</Label>
                        <Input
                          id="price"
                          type="number"
                          step="0.01"
                          value={productForm.price}
                          onChange={(e) => setProductForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="image">Product Image</Label>
                        <Input
                          id="image"
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="mb-2"
                        />
                        {imagePreview && (
                          <div className="mt-2">
                            <Label>Preview:</Label>
                            <img 
                              src={imagePreview} 
                              alt="Preview" 
                              className="w-32 h-32 object-cover border rounded"
                            />
                          </div>
                        )}
                        {editingProduct?.image_url && !imagePreview && (
                          <div className="mt-2">
                            <Label>Current Image:</Label>
                            <img 
                              src={editingProduct.image_url.startsWith('/') 
                                ? `http://localhost:3001${editingProduct.image_url}` 
                                : editingProduct.image_url
                              } 
                              alt="Current" 
                              className="w-32 h-32 object-cover border rounded"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <DialogFooter className="mt-6">
                      <Button type="button" variant="outline" onClick={() => setProductDialog(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {editingProduct ? 'Update' : 'Create'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.price} IDR</TableCell>
                      <TableCell>{new Date(product.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingProduct(product);
                              setProductForm({
                                name: product.name,
                                description: product.description || '',
                                price: product.price,
                                image_url: product.image_url || ''
                              });
                              setSelectedImage(null);
                              setImagePreview(null);
                              setProductDialog(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteProduct(product.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>Manage user accounts and permissions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.is_verified ? "default" : "secondary"}>
                          {user.is_verified ? "Verified" : "Unverified"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.admin === 1 ? "destructive" : "outline"}>
                          {user.admin === 1 ? "Admin" : "User"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Select
                            value={user.admin?.toString() || "0"}
                            onValueChange={(value) => handleUpdateUser(user.id, { admin: parseInt(value) })}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">User</SelectItem>
                              <SelectItem value="1">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Install Data Tab */}
        {activeTab === 'installs' && (
          <Card>
            <CardHeader>
              <CardTitle>Install Data</CardTitle>
              <CardDescription>Manage Windows installation requests</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Windows Version</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installData.map((install) => (
                    <TableRow key={install.id}>
                      <TableCell>{install.username}</TableCell>
                      <TableCell className="font-mono">{install.ip}</TableCell>
                      <TableCell>{install.win_ver}</TableCell>
                      <TableCell>{getStatusBadge(install.status)}</TableCell>
                      <TableCell>{new Date(install.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Select
                          value={install.status}
                          onValueChange={(value) => handleUpdateInstallStatus(install.id, value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="running">Running</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Payment Methods Tab */}
        {activeTab === 'payments' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Payment Methods</CardTitle>
                <CardDescription>Manage payment methods and their availability</CardDescription>
              </div>
              <Button
                onClick={async () => {
                  try {
                    const response = await apiService.syncPaymentMethods();
                    if (response.data.success) {
                      toast({
                        title: 'Sync successful',
                        description: `Synced ${response.data.data?.totalFromTripay} payment methods from Tripay`,
                      });
                      await loadData();
                    }
                  } catch (error: any) {
                    toast({
                      variant: 'destructive',
                      title: 'Sync failed',
                      description: error.response?.data?.message || 'Failed to sync payment methods',
                    });
                  }
                }}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Sync from Tripay
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Fee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentMethods.map((method) => (
                    <TableRow key={method.code}>
                      <TableCell className="font-mono">{method.code}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {method.icon_url && (
                            <img 
                              src={method.icon_url} 
                              alt={method.name}
                              className="w-6 h-6 object-contain"
                            />
                          )}
                          <span className="font-medium">{method.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{method.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>Flat: Rp {method.fee_flat?.toLocaleString() || 0}</div>
                          <div>Percent: {method.fee_percent || 0}%</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {method.is_enabled ? (
                          <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant={method.is_enabled ? "destructive" : "default"}
                          size="sm"
                          onClick={async () => {
                            try {
                              await apiService.updatePaymentMethod(method.code, {
                                is_enabled: !method.is_enabled
                              });
                              toast({
                                title: 'Payment method updated',
                                description: `${method.name} has been ${method.is_enabled ? 'disabled' : 'enabled'}`,
                              });
                              await loadData();
                            } catch (error: any) {
                              toast({
                                variant: 'destructive',
                                title: 'Update failed',
                                description: error.response?.data?.message || 'Failed to update payment method',
                              });
                            }
                          }}
                        >
                          {method.is_enabled ? 'Disable' : 'Enable'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {paymentMethods.length === 0 && (
                <div className="text-center py-8">
                  <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-muted-foreground mb-2">No payment methods found</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Click "Sync from Tripay" to load payment methods from your Tripay account
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}