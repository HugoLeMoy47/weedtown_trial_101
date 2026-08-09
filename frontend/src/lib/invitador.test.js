// Ciclo 11A: de dónde sale el handle de quien invitó.
//
// Esta función decide A QUIÉN se le acredita una invitación, así que un error
// aquí no es cosmético: acredita a la cuenta equivocada, o pierde la
// invitación en silencio. Se prueba aparte porque es la única parte del
// mecanismo que interpreta texto que viene de una URL.
import { invitadorDeNext } from './invitador';

describe('invitadorDeNext', () => {
  it('saca el handle de la ruta de un perfil', () => {
    expect(invitadorDeNext('/@luna')).toBe('luna');
    expect(invitadorDeNext('/@ana_23')).toBe('ana_23');
  });

  // Un enlace compartido con mayúsculas resuelve al perfil igual, así que
  // tiene que contar la invitación igual. El backend normaliza a minúsculas.
  it('normaliza a minúsculas, como el backend', () => {
    expect(invitadorDeNext('/@Luna')).toBe('luna');
    expect(invitadorDeNext('/@LUNA')).toBe('luna');
  });

  // El caso que el `$` del final evita: una ruta más profunda no es el perfil
  // de esa persona, y acreditarle la invitación sería atribuir de más.
  it('no casa rutas más profundas', () => {
    expect(invitadorDeNext('/@luna/algo')).toBeNull();
    expect(invitadorDeNext('/@luna/posts/3')).toBeNull();
  });

  it('no casa rutas que no son un perfil', () => {
    expect(invitadorDeNext('/feed')).toBeNull();
    expect(invitadorDeNext('/p/59')).toBeNull();
    expect(invitadorDeNext('/perfil/7')).toBeNull();
    expect(invitadorDeNext('')).toBeNull();
    expect(invitadorDeNext(null)).toBeNull();
    expect(invitadorDeNext(undefined)).toBeNull();
  });

  // El handle tiene un formato y hay que respetarlo: lo que no lo cumple no
  // existe como cuenta, así que aceptarlo solo abriría consultas inútiles.
  it('respeta el formato del handle', () => {
    expect(invitadorDeNext('/@ab')).toBeNull();                      // muy corto
    expect(invitadorDeNext('/@' + 'a'.repeat(21))).toBeNull();       // muy largo
    expect(invitadorDeNext('/@_luna')).toBeNull();                   // no empieza con letra o número
    expect(invitadorDeNext('/@luna-mala')).toBeNull();               // guion medio no
    expect(invitadorDeNext('/@luna.mala')).toBeNull();
  });

  it('no se deja engañar por rutas raras', () => {
    expect(invitadorDeNext('//@luna')).toBeNull();
    expect(invitadorDeNext('/@../../etc')).toBeNull();
    expect(invitadorDeNext('https://otro.sitio/@luna')).toBeNull();
    expect(invitadorDeNext('/@luna?x=1')).toBeNull();
  });
});
