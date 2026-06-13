from django.http import JsonResponse


def health(_request):
    return JsonResponse({"status": "ok"})


def home(_request):
    return JsonResponse({"message": "Your Django app is running. Edit core/views.py."})
