from rest_framework import permissions


class IsPlaceMember(permissions.BasePermission):
    """Only members of the Place can access."""

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        place = getattr(obj, 'place', None) or obj
        if place is None:
            return False
        return place.members.filter(user=request.user).exists()


class IsPlaceMemberOrReadOnly(permissions.BasePermission):
    """Members can do anything; others no access."""

    def has_object_permission(self, request, view, obj):
        place = getattr(obj, 'place', None) or obj
        return place.members.filter(user=request.user).exists()
