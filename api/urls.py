from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

router = DefaultRouter()
router.register(r'places', views.PlaceViewSet, basename='place')

urlpatterns = [
    path('hello/', views.hello_world),
    path('auth/me/', views.me),
    path('auth/register/', views.register),
    path('auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('invite/<str:token>/', views.invite_by_token),
    path('join/<str:token>/', views.join_place),
    path('', include(router.urls)),
    # Nested under place
    path('places/<int:place_id>/members/', views.PlaceMemberList.as_view(), name='place-members'),
    path('places/<int:place_id>/summary/', views.place_summary, name='place-summary'),
    path('places/<int:place_id>/categories/', views.ExpenseCategoryViewSet.as_view({
        'get': 'list', 'post': 'create',
    }), name='place-categories-list'),
    path('places/<int:place_id>/categories/<int:pk>/', views.ExpenseCategoryViewSet.as_view({
        'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
    }), name='place-categories-detail'),
    path('places/<int:place_id>/expenses/', views.ExpenseViewSet.as_view({
        'get': 'list', 'post': 'create',
    }), name='place-expenses-list'),
    path('places/<int:place_id>/expenses/<int:pk>/', views.ExpenseViewSet.as_view({
        'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
    }), name='place-expenses-detail'),
    path('places/<int:place_id>/invites/', views.PlaceInviteViewSet.as_view({
        'get': 'list', 'post': 'create', 'delete': 'destroy',
    }), name='place-invites-list'),
    path('places/<int:place_id>/invites/<int:pk>/', views.PlaceInviteViewSet.as_view({
        'get': 'retrieve', 'delete': 'destroy',
    }), name='place-invites-detail'),
]
