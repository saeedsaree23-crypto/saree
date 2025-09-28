import { useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, Search, Package, MapPin, Clock, Phone, User, RefreshCw, Bell, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';

interface QuickOrder {
  id: string;
  orderNumber: string;
  restaurantName: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'on_way' | 'delivered';
  estimatedTime?: string;
}

export default function TrackOrdersPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchOrderNumber, setSearchOrderNumber] = useState('');
  const [searchedOrder, setSearchedOrder] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());

  // جلب الطلبات النشطة من قاعدة البيانات مع تحديث تلقائي
  const customerPhone = '+967771234567'; // في التطبيق الحقيقي سيأتي من نظام المصادقة
  
  const { data: activeOrders = [], isLoading: activeOrdersLoading, refetch: refetchActiveOrders } = useQuery<QuickOrder[]>({
    queryKey: ['active-orders', customerPhone],
    queryFn: async () => {
      const response = await fetch(`/api/orders/customer/${encodeURIComponent(customerPhone)}`);
      if (!response.ok) throw new Error('فشل في جلب الطلبات النشطة');
      const data = await response.json();
      
      // فلترة الطلبات النشطة فقط
      const activeStatuses = ['pending', 'confirmed', 'preparing', 'on_way'];
      const activeOrders = data.filter((order: any) => activeStatuses.includes(order.status));
      
      setLastUpdateTime(Date.now());
      
      return activeOrders.map((order: any) => ({
        id: order.id,
        orderNumber: order.orderNumber || order.id.slice(0, 8),
        restaurantName: order.restaurantName || 'مطعم غير معروف',
        status: order.status,
        estimatedTime: order.estimatedTime,
        totalAmount: order.totalAmount,
        deliveryAddress: order.deliveryAddress,
        customerPhone: order.customerPhone,
        driverName: order.driverName,
        driverPhone: order.driverPhone
      }));
    },
    refetchInterval: 5000, // تحديث كل 5 ثوانِ للطلبات النشطة
    retry: 1
  });

  const handleSearchOrder = async () => {
    if (!searchOrderNumber.trim()) {
      toast({
        title: "أدخل رقم الطلب",
        description: "يرجى إدخال رقم الطلب للبحث",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    
    try {
      // البحث في قاعدة البيانات
      const response = await fetch(`/api/orders/search?orderNumber=${encodeURIComponent(searchOrderNumber)}&customerPhone=${encodeURIComponent(customerPhone)}`);
      
      if (response.ok) {
        const order = await response.json();
        setSearchedOrder(order);
        toast({
          title: "تم العثور على الطلب",
          description: `طلب ${order.orderNumber} - ${order.restaurantName}`,
        });
      } else {
        setSearchedOrder(null);
        toast({
          title: "طلب غير موجود",
          description: "لم يتم العثور على طلب بهذا الرقم أو أنه لا يخصك",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('خطأ في البحث:', error);
      toast({
        title: "خطأ في البحث",
        description: "حدث خطأ أثناء البحث عن الطلب",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const statusMap = {
      pending: 'قيد المراجعة',
      confirmed: 'مؤكد',
      preparing: 'قيد التحضير',
      on_way: 'في الطريق',
      delivered: 'تم التوصيل'
    };
    return statusMap[status as keyof typeof statusMap] || status;
  };

  const getStatusColor = (status: string) => {
    const colorMap = {
      pending: 'bg-yellow-500',
      confirmed: 'bg-blue-500',
      preparing: 'bg-orange-500',
      on_way: 'bg-purple-500',
      delivered: 'bg-green-500'
    };
    return colorMap[status as keyof typeof colorMap] || 'bg-gray-500';
  };

  const handleViewFullTracking = (orderId: string) => {
    setLocation(`/orders/${orderId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/')}
              data-testid="button-back"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">تتبع الطلبات</h1>
              <p className="text-sm text-gray-500">تابع حالة طلباتك النشطة</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* Search Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              البحث عن طلب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="أدخل رقم الطلب (مثال: ORD001)"
                value={searchOrderNumber}
                onChange={(e) => setSearchOrderNumber(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearchOrder()}
                data-testid="input-search-order"
              />
              <Button 
                onClick={handleSearchOrder}
                disabled={isSearching}
                data-testid="button-search-order"
              >
                {isSearching ? 'جاري البحث...' : 'بحث'}
              </Button>
            </div>
            
            {searchedOrder && (
              <Alert>
                <Package className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">طلب {searchedOrder.orderNumber}</span>
                      <Badge className={`${getStatusColor(searchedOrder.status)} text-white`}>
                        {getStatusLabel(searchedOrder.status)}
                      </Badge>
                    </div>
                    <p className="text-sm">{searchedOrder.restaurantName}</p>
                    {searchedOrder.estimatedTime && (
                      <p className="text-xs text-muted-foreground">
                        الوقت المتوقع: {searchedOrder.estimatedTime}
                      </p>
                    )}
                    <Button
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => handleViewFullTracking(searchedOrder.id)}
                      data-testid="button-view-searched-order"
                    >
                      عرض التفاصيل الكاملة
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Active Orders */}
        {activeOrders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                الطلبات النشطة
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span>تحديث مباشر</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchActiveOrders()}
                    disabled={activeOrdersLoading}
                  >
                    <RefreshCw className={`h-3 w-3 ${activeOrdersLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeOrdersLoading && (
                <div className="text-center py-4">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                  <p className="text-sm text-gray-500">جاري تحديث الطلبات...</p>
                </div>
              )}
              
              {activeOrders.map((order) => (
                <div 
                  key={order.id}
                  className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-all duration-200 hover:shadow-md"
                  onClick={() => handleViewFullTracking(order.id)}
                  data-testid={`order-card-${order.id}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold">{order.restaurantName}</h3>
                      <p className="text-sm text-gray-500">طلب رقم: {order.orderNumber}</p>
                      {order.totalAmount && (
                        <p className="text-sm font-medium text-green-600">
                          المجموع: {order.totalAmount} ريال
                        </p>
                      )}
                    </div>
                    <div className="text-left">
                      <Badge className={`${getStatusColor(order.status)} text-white`}>
                        {getStatusLabel(order.status)}
                      </Badge>
                      {order.status === 'on_way' && (
                        <div className="mt-1">
                          <Progress value={75} className="w-20 h-2" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    {order.estimatedTime && (
                      <div className="flex items-center gap-1 text-blue-600">
                      <Clock className="h-4 w-4" />
                      <span>الوقت المتوقع: {order.estimatedTime}</span>
                      </div>
                    )}
                    
                    {order.driverName && (
                      <div className="flex items-center gap-1 text-green-600">
                        <User className="h-4 w-4" />
                        <span>السائق: {order.driverName}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* أزرار سريعة للطلبات النشطة */}
                  {order.status === 'on_way' && order.driverPhone && (
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`tel:${order.driverPhone}`);
                        }}
                        className="flex-1"
                      >
                        <Phone className="h-3 w-3 mr-1" />
                        اتصال بالسائق
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const encodedAddress = encodeURIComponent(order.deliveryAddress || '');
                          window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
                        }}
                        className="flex-1"
                      >
                        <Navigation className="h-3 w-3 mr-1" />
                        عرض الموقع
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              إجراءات سريعة
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Button
              variant="outline"
              className="h-20 flex flex-col gap-2"
              onClick={() => setLocation('/orders')}
              data-testid="button-all-orders"
            >
              <Package className="h-6 w-6" />
              <span className="text-sm">جميع الطلبات</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-20 flex flex-col gap-2"
              onClick={() => setLocation('/addresses')}
              data-testid="button-delivery-addresses"
            >
              <MapPin className="h-6 w-6" />
              <span className="text-sm">عناوين التوصيل</span>
            </Button>
          </CardContent>
        </Card>

        {/* Contact Support */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              هل تحتاج مساعدة؟
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              إذا كان لديك أي استفسار حول طلبك، يمكنك التواصل معنا مباشرة
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={() => window.open('tel:+967771234567')}
                data-testid="button-call-support"
              >
                <Phone className="h-4 w-4" />
                اتصل بنا
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={() => window.open('https://wa.me/967771234567')}
                data-testid="button-whatsapp-support"
              >
                <User className="h-4 w-4" />
                واتساب
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <Alert>
          <Package className="h-4 w-4" />
          <AlertDescription>
            <strong>نصائح للمتابعة:</strong>
            <ul className="mt-2 text-sm space-y-1">
              <li>• احتفظ برقم الطلب للمتابعة السريعة</li>
              <li>• ستصلك إشعارات فورية عند تغير حالة الطلب</li>
              <li>• يمكنك الاتصال بالسائق عند وصوله</li>
              <li>• التحديث التلقائي مفعل كل 5 ثوانِ للطلبات النشطة</li>
            </ul>
          </AlertDescription>
        </Alert>
        
        {/* مؤشر آخر تحديث */}
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-green-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>آخر تحديث: {new Date(lastUpdateTime).toLocaleTimeString('ar-YE')}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}