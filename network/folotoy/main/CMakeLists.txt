idf_component_register(
    SRCS "main.c"
         "space_card.c"
         "space_card_model.c"
    INCLUDE_DIRS "."
    REQUIRES bsp esp_timer esp_hw_support
)
