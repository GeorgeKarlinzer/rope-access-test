namespace Vanguard.Bootstrapper.Models
{
    public enum BuildingStatus
    {
        Active,
        Completed,
    }

    public enum TagType
    {
        Anchor,
        Cleaning,
        Issue,
    }

    public enum TagStatus
    {
        None,

        BeforeCheck,
        PassedCheck,
        FailedCheck,

        BeforeCleaning,
        AfterCleaning,
    }

    public enum TagPhotoKind
    {
        General,
        Before,
        After,
    }
}

