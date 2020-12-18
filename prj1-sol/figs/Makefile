SRC = $(wildcard *.dot)
TARGETS = $(SRC:.dot=.png)

all:		$(TARGETS)

%.png:			%.dot
			dot $< -Tpng -o $@

