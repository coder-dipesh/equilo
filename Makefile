.PHONY: run check install

run:
	python3 manage.py runserver 8001

check:
	python3 manage.py check

migrate:
	python3 manage.py migrate

install:
	pip install -r requirements.txt
