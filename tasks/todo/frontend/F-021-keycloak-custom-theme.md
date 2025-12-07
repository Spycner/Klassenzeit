# Style Keycloak Login Page to Match App

## Description
Create a custom Keycloak theme that matches the Klassenzeit app's styling (Tailwind CSS / shadcn/ui design system).

## Acceptance Criteria
- [ ] Custom Keycloak theme created in `docker/keycloak/themes/klassenzeit/`
- [ ] Login page styled to match app's color scheme and typography
- [ ] Theme mounted in `compose.yml`
- [ ] Realm configured to use custom theme
- [ ] Registration page styled consistently
- [ ] Error/success messages styled appropriately

## Notes
- Keycloak uses FreeMarker templates (.ftl files)
- Can extend default theme and override only CSS for simpler approach
- Theme properties file needed to define parent theme and styles

## References
- Keycloak Themes Documentation: https://www.keycloak.org/docs/latest/server_development/#_themes
