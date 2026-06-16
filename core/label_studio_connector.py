import requests
from django.conf import settings
from .models import RetrainingQueue

def _label_studio_headers():
    return {
        "Authorization": f"Token {settings.LABEL_STUDIO_API_KEY}",
        "Content-Type": "application/json",
    }

def _build_image_url(log_entry):
    if not hasattr(log_entry, "image_snapshot"):
        raise ValueError("InferenceLog has no image_snapshot")
    if not log_entry.image_snapshot:
        raise ValueError("InferenceLog image_snapshot is empty")
    
    return settings.SITE_URL.rstrip("/") + log_entry.image_snapshot.url

def create_label_studio_task(queue_item):
    data = {
        "project": settings.LABEL_STUDIO_PROJECT_ID,
        "data": {
            "image": _build_image_url(queue_item.log_entry),
        }
    }
    resp = requests.post(
        f"{settings.LABEL_STUDIO_URL.rstrip('/')}/api/tasks",
        json=data,
        headers=_label_studio_headers(),
        timeout=30,
    )
    resp.raise_for_status()
    task = resp.json()

    task_id = task.get("id") or (task.get("task") or {}).get("id")
    if not task_id:
        raise ValueError("Unable to read Label Studio task id")

    queue_item.label_studio_task_id = task_id
    queue_item.label_studio_exported = True
    queue_item.save(update_fields=["label_studio_task_id", "label_studio_exported"])

    return task_id

def get_label_studio_task(task_id):
    resp = requests.get(
        f"{settings.LABEL_STUDIO_URL.rstrip('/')}/api/tasks/{task_id}",
        headers= _label_studio_headers(),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()

def import_label_studio_annotations(queue_item):
    if not queue_item.label_studio_task_id:
        return None

    task = get_label_studio_task(queue_item.label_studio_task_id)
    annotations = task.get("annotations") or []
    if not annotations:
        return None

    annotation = annotations[0]
    result = annotation.get("result") or []
    if not result:
        return None

    queue_item.label_data = result
    queue_item.status = "LABELED"
    queue_item.save(update_fields=["label_data", "status"])
    return result

def export_to_label_studio(queue_items):
    results = []
    for item in queue_items:
        try:
            task_id = create_label_studio_task(item)
            results.append({"queue_id": item.id, "task_id": task_id, "success": True})
        except Exception as exc:
            results.append({"queue_id": item.id, "error": str(exc), "success": False})
    return results

def import_from_label_studio(queue_items):
    results = []
    for item in queue_items:
        try:
            annotation = import_label_studio_annotations(item)
            results.append(
                {
                    "queue_id": item.id,
                    "task_id": item.label_studio_task_id,
                    "imported": bool(annotation),
                }
            )
        except Exception as exc:
            results.append({"queue_id": item.id, "error": str(exc), "success": False})
    return results