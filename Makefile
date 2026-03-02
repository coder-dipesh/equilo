.PHONY: run run-mobile check install

run:
	python3 manage.py runserver 8001

run-mobile:
	python3 manage.py runserver 0.0.0.0:8001

check:
	python3 manage.py check

migrate:
	python3 manage.py migrate

install:
	pip install -r requirements.txt
