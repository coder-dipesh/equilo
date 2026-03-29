from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'places', views.PlaceViewSet, basename='place')

urlpatterns = [
    path('hello/', views.hello_world),
    path('stats/', views.stats),
    path('dashboard/', views.dashboard),
    path('activity/', views.activity_list),
    path('notifications/', views.notifications_list),
    path('notifications/mark_all_read/', views.notifications_mark_all_read),
    path('notifications/<int:notification_id>/read/', views.notifications_mark_read),
    path('places/<int:place_id>/request_payment/', views.request_payment, name='place-request-payment'),
    path('places/<int:place_id>/members/remove/', views.remove_member, name='place-remove-member'),
    path('places/<int:place_id>/leave/', views.leave_place, name='place-leave'),
    path('places/<int:place_id>/settlements/', views.settlement_list, name='place-settlements'),
    path('settlements/', views.settlement_create, name='settlement-create'),
    path('auth/me/', views.me),
    path('auth/password/change/', views.change_password),
    path('auth/account/delete/', views.delete_account),
    path('auth/sessions/', views.sessions_list),
    path('auth/sessions/register/', views.sessions_register),
    path('auth/sessions/revoke_all/', views.sessions_revoke_all),
    path('auth/sessions/<str:jti>/revoke/', views.session_revoke),
    path('auth/register/', views.register),
    path('auth/logout/', views.auth_logout),
    path('auth/token/', views.EquiloTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/token/refresh/', views.CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('invite/<str:token>/', views.invite_by_token),
    path('join/<str:token>/', views.join_place),
    path('', include(router.urls)),
    # Nested under place
    path('places/<int:place_id>/members/', views.PlaceMemberList.as_view(), name='place-members'),
    path('places/<int:place_id>/cycles/', views.CycleListCreate.as_view(), name='place-cycles-list'),
    path('places/<int:place_id>/cycles/<int:pk>/resolve/', views.cycle_resolve, name='place-cycle-resolve'),
    path('places/<int:place_id>/cycles/<int:pk>/reopen/', views.cycle_reopen, name='place-cycle-reopen'),
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
