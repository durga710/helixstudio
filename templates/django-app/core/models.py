from django.db import models


class Item(models.Model):
    """A sample model. Replace with your own; run makemigrations + migrate."""

    name = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name
