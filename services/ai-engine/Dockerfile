FROM python:3.12-alpine
WORKDIR /app
COPY app.py .
RUN adduser -D -u 10001 sentinel
USER sentinel
ENV PORT=4002
EXPOSE 4002
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:4002/health',timeout=3).status==200 else 1)"
CMD ["python", "-u", "app.py"]
