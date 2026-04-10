use proptest::prelude::*;
use solver_core::reverse_chars;

proptest! {
    #[test]
    fn reversing_twice_yields_original(s in ".*") {
        let once = reverse_chars(&s);
        let twice = reverse_chars(&once);
        prop_assert_eq!(twice, s);
    }
}
