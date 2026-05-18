from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from rest_framework import permissions


SAFE_METHODS = permissions.SAFE_METHODS


def _is_manager(user):
    return getattr(user, 'role', None) == 'Manajer'


class IsManagerForAssets(permissions.BasePermission):
    """Read open to authenticated users; write requires Manajer role."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return _is_manager(request.user)


class IsManagerForUsers(permissions.BasePermission):
    """User management is manager-only across read and write."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return _is_manager(request.user)


class IsOwnerOrManagerWithGrace(permissions.BasePermission):
    """
    Inspection log mutation rules:
      - Manager: full access (any log).
      - Technician: may edit own log only within INSPECTION_EDIT_GRACE_MINUTES of creation;
        beyond that, must POST an amendment.
      - Hard delete: manager only.
    Read is open to any authenticated user (org scoping happens in get_queryset).
    """

    grace_message = (
        'Edit window has expired. Submit an amendment via '
        'POST /api/inspections/{id}/amend/ instead.'
    )

    def has_permission(self, request, view):
        return request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if _is_manager(request.user):
            return True
        # Technician: must be the owner
        if obj.user_id != request.user.id:
            return False
        # Once verified, a teknisi can no longer modify — manager only
        if obj.verified_at is not None:
            return False
        if request.method == 'DELETE':
            # Hard delete restricted to managers
            return False
        # PUT / PATCH — only within grace window
        grace = timedelta(minutes=settings.INSPECTION_EDIT_GRACE_MINUTES)
        return (timezone.now() - obj.created_at) < grace
