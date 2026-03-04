from backend.main import app
for route in app.routes:
    print(f"{route.path} {getattr(route, 'methods', None)}")
